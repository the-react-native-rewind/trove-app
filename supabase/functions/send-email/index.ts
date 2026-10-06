// send-email: Trove's transactional emails, sent through Resend.
//
// Called by Postgres, not by the app. Triggers in
// migrations/0013_transactional_emails.sql post here through pg_net:
//   { "type": "welcome", "user_id": "<uuid>" }   after a person confirms their email
//   { "type": "invite",  "invite_id": "<uuid>" }  after someone creates a circle invite
//
// verify_jwt: false (supabase/config.toml). The caller proves itself with the
// x-trove-hook-secret header, which must equal the TROVE_EMAIL_HOOK_SECRET
// function secret (the same value lives in Vault as trove_email_hook_secret).
// The body only carries ids. Everything else (address, names, links) is read
// here with the service role, so a caller cannot choose who gets emailed.
//
// Secrets: RESEND_API_KEY (sending access, trove.thereactnativerewind.com only),
// TROVE_EMAIL_HOOK_SECRET. Optional: TROVE_EMAIL_FROM, TROVE_EMAIL_REPLY_TO,
// TROVE_SITE_URL.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { inviteEmail, welcomeEmail, type RenderedEmail } from '../_shared/emailCopy.ts';
import { INVITE_LIMIT_PER_DAY } from '../_shared/inviteLimit.ts';
import { DEFAULT_SITE_URL, inviteUrl, openPageUrl } from '../_shared/site.ts';

const FROM = Deno.env.get('TROVE_EMAIL_FROM') ?? 'Trove <hello@trove.thereactnativerewind.com>';
const REPLY_TO = Deno.env.get('TROVE_EMAIL_REPLY_TO') ?? 'luke@thereactnativerewind.com';
const SITE_URL = (Deno.env.get('TROVE_SITE_URL') ?? DEFAULT_SITE_URL).replace(/\/$/, '');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sendViaResend(
  to: string,
  email: RenderedEmail,
  idempotencyKey: string,
  tag: string,
): Promise<{ id?: string; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return { error: 'RESEND_API_KEY is not set' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: REPLY_TO,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [{ name: 'email', value: tag }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `Resend ${res.status}: ${JSON.stringify(body)}` };
  return { id: body.id };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expected = Deno.env.get('TROVE_EMAIL_HOOK_SECRET');
  const given = req.headers.get('x-trove-hook-secret') ?? '';
  if (!expected || !timingSafeEqual(given, expected)) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase environment is not configured' }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let payload: { type?: string; user_id?: string; invite_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  try {
    if (payload.type === 'welcome' && payload.user_id) {
      const { data, error } = await admin.auth.admin.getUserById(payload.user_id);
      if (error || !data.user) return json({ skipped: 'user not found' });
      const user = data.user;
      if (!user.email || !user.email_confirmed_at) return json({ skipped: 'email not confirmed' });

      const { data: profile } = await admin
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();

      const email = welcomeEmail({
        name: profile?.display_name ?? (user.user_metadata?.display_name as string | undefined) ?? null,
        email: user.email,
        openUrl: openPageUrl('', SITE_URL),
        siteUrl: SITE_URL,
      });
      const sent = await sendViaResend(user.email, email, `trove-welcome-${user.id}`, 'welcome');
      if (sent.error) {
        console.error('welcome email failed', sent.error);
        return json({ error: sent.error }, 502);
      }
      return json({ sent: 'welcome', id: sent.id });
    }

    if (payload.type === 'invite' && payload.invite_id) {
      const { data: invite } = await admin
        .from('invites')
        .select('id, email, role, token, status, expires_at, invited_by, space:spaces(name)')
        .eq('id', payload.invite_id)
        .maybeSingle();
      if (!invite) return json({ skipped: 'invite not found' });
      if (invite.status !== 'pending') return json({ skipped: `invite is ${invite.status}` });
      if (new Date(invite.expires_at) < new Date()) return json({ skipped: 'invite expired' });

      if (invite.invited_by) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await admin
          .from('invites')
          .select('id', { count: 'exact', head: true })
          .eq('invited_by', invite.invited_by)
          .gte('created_at', since);
        // Backstop if a row is inserted over the cap. Migration 0024 rejects the insert first.
        if ((count ?? 0) > INVITE_LIMIT_PER_DAY) {
          console.warn('invite email skipped: daily limit', invite.invited_by);
          return json({ skipped: 'daily invite email limit' });
        }
      }

      const { data: inviter } = invite.invited_by
        ? await admin.from('profiles').select('display_name').eq('id', invite.invited_by).maybeSingle()
        : { data: null };

      const space = invite.space as unknown as { name: string } | null;
      const email = inviteEmail({
        inviterName: inviter?.display_name ?? null,
        circleName: space?.name ?? 'a circle',
        inviteeEmail: invite.email,
        role: invite.role,
        joinUrl: inviteUrl(invite.token, SITE_URL),
        getAppUrl: `${SITE_URL}/#download`,
        expiresAt: new Date(invite.expires_at),
        siteUrl: SITE_URL,
      });
      const sent = await sendViaResend(invite.email, email, `trove-invite-${invite.id}`, 'circle-invite');
      if (sent.error) {
        console.error('invite email failed', sent.error);
        return json({ error: sent.error }, 502);
      }
      return json({ sent: 'invite', id: sent.id });
    }

    return json({ error: 'Unknown email type' }, 400);
  } catch (e) {
    console.error('send-email crashed', e);
    return json({ error: 'Internal error' }, 500);
  }
});
