// RevenueCat → Supabase: mirror the "pro" entitlement into profiles.is_pro.
//
// RevenueCat sends every subscription event here with the shared secret in the
// Authorization header or as ?key= on the URL (REVENUECAT_WEBHOOK_SECRET). Deployed with --no-verify-jwt;
// this function does its own auth check.
//
// The app logs in to RevenueCat with the Supabase user id, so app_user_id is a
// profiles.id.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ENTITLEMENT = 'pro';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GRANTING = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'REFUND_REVERSED',
]);

type RcEvent = {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  transferred_from?: string[];
  transferred_to?: string[];
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function userIds(ids: (string | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id && UUID.test(id)))];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
  // Either the Authorization header (preferred, set in the RevenueCat dashboard)
  // or a ?key= on the webhook URL (the RevenueCat API can't set headers).
  const header = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const fromUrl = new URL(req.url).searchParams.get('key') ?? '';
  const ok = !!secret && (safeEqual(header, secret) || safeEqual(fromUrl, secret));
  if (!ok) {
    return new Response('unauthorized', { status: 401 });
  }

  let event: RcEvent;
  try {
    event = ((await req.json()) as { event?: RcEvent }).event ?? {};
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const setPro = async (ids: string[], value: boolean) => {
    if (ids.length === 0) return;
    const { error } = await db.from('profiles').update({ is_pro: value }).in('id', ids);
    if (error) throw error;
  };

  const type = event.type ?? '';
  const ids = userIds([event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])]);
  const hasPro = (event.entitlement_ids ?? []).includes(ENTITLEMENT);
  const notExpired = !event.expiration_at_ms || event.expiration_at_ms > Date.now();

  try {
    if (type === 'TEST') {
      // Dashboard "Send test event": auth worked, nothing to change.
    } else if (type === 'TRANSFER') {
      await setPro(userIds(event.transferred_from ?? []), false);
      await setPro(userIds(event.transferred_to ?? []), true);
    } else if (type === 'EXPIRATION') {
      if (hasPro || (event.entitlement_ids ?? []).length === 0) await setPro(ids, false);
    } else if (GRANTING.has(type) && hasPro) {
      await setPro(ids, notExpired);
    }
    // CANCELLATION / BILLING_ISSUE keep access until EXPIRATION arrives.
  } catch (e) {
    console.error('revenuecat-webhook update failed', type, (e as Error).message);
    return new Response('update failed', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, type }), {
    headers: { 'content-type': 'application/json' },
  });
});
