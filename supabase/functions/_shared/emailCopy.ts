// Copy for every Trove email. Plain words, short lines.
// Auth templates keep Supabase's Go template variables ({{ .ConfirmationURL }} etc.).

import { button, esc, fallbackLink, h1, layout, p, panel, steps, brand } from './email.ts';

export const DEFAULT_SITE_URL = 'https://trove-website-sooty.vercel.app';

const markUrl = (siteUrl: string) => `${siteUrl.replace(/\/$/, '')}/mark.png`;

// ---------------------------------------------------------------------------
// Supabase Auth templates
// ---------------------------------------------------------------------------

export type AuthTemplate = { key: string; subject: string; html: string };

const authFooter = `You got this because someone used {{ .Email }} on Trove.`;

export function authTemplates(siteUrl = DEFAULT_SITE_URL): AuthTemplate[] {
  const wrap = (title: string, preheader: string, body: string, footerNote = authFooter) =>
    layout({ title, preheader, body, footerNote, markUrl: markUrl(siteUrl) });

  return [
    {
      key: 'confirmation',
      subject: 'Confirm your email for Trove',
      html: wrap(
        'Confirm your email for Trove',
        "One tap and you're in.",
        [
          h1("One tap and you're in."),
          p('Confirm this is your email.'),
          p('Trove opens. You are signed in. Done.'),
          button('Confirm my email', '{{ .ConfirmationURL }}'),
          p('Open this on the phone or Mac where Trove is installed. Confirmed it somewhere else? Open Trove and sign in.', { muted: true, size: 14 }),
          p("Didn't sign up for Trove? Ignore this. Nothing happens.", { muted: true, size: 14 }),
          fallbackLink('{{ .ConfirmationURL }}'),
        ].join('\n'),
      ),
    },
    {
      key: 'recovery',
      subject: 'Reset your Trove password',
      html: wrap(
        'Reset your Trove password',
        'Tap the button and pick a new one.',
        [
          h1('Forgot your password? Happens.'),
          p('Tap below. Pick a new one. Back to your list.'),
          button('Choose a new password', '{{ .ConfirmationURL }}'),
          p('The link works once and runs out in 1 hour. Open it on the device where you use Trove.', { muted: true, size: 14 }),
          p("Didn't ask for this? Ignore it. Your password stays the same.", { muted: true, size: 14 }),
          fallbackLink('{{ .ConfirmationURL }}'),
        ].join('\n'),
      ),
    },
    {
      key: 'magic_link',
      subject: 'Your Trove sign-in link',
      html: wrap(
        'Your Trove sign-in link',
        'Tap to sign in. No password needed.',
        [
          h1("Here's your way in."),
          p('Tap below to sign in to Trove. No password needed.'),
          button('Sign in to Trove', '{{ .ConfirmationURL }}'),
          p("Works once. Runs out in 1 hour. Didn't ask for it? Ignore this.", { muted: true, size: 14 }),
          fallbackLink('{{ .ConfirmationURL }}'),
        ].join('\n'),
      ),
    },
    {
      key: 'email_change',
      subject: 'Confirm your new email for Trove',
      html: wrap(
        'Confirm your new email for Trove',
        'One tap to move your Trove account to a new address.',
        [
          h1('New email? Confirm it.'),
          p('You asked to move your Trove account:'),
          panel(
            `<p style="margin:0;font-family:'Hanken Grotesk',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${brand.ink};">From <strong>{{ .Email }}</strong><br>To <strong>{{ .NewEmail }}</strong></p>`,
          ),
          p('Tap below to confirm.'),
          button('Confirm new email', '{{ .ConfirmationURL }}'),
          p("Didn't ask for this? Don't tap. Change your password in Trove instead.", { muted: true, size: 14 }),
          fallbackLink('{{ .ConfirmationURL }}'),
        ].join('\n'),
      ),
    },
    {
      key: 'invite',
      subject: "You're invited to Trove",
      html: wrap(
        "You're invited to Trove",
        'Your account is ready. Tap to accept.',
        [
          h1("You're invited to Trove."),
          p('Shared lists for real life. The house. The club. The side business.'),
          p('Your account is ready. Tap below to accept.'),
          button('Accept invite', '{{ .ConfirmationURL }}'),
          p("Not expecting this? Ignore it. Nothing happens.", { muted: true, size: 14 }),
          fallbackLink('{{ .ConfirmationURL }}'),
        ].join('\n'),
        'You got this because someone invited {{ .Email }} to Trove.',
      ),
    },
    {
      key: 'reauthentication',
      subject: '{{ .Token }} is your Trove code',
      html: wrap(
        'Your Trove code',
        'Type this code into Trove to carry on.',
        [
          h1('Your code'),
          p('Type this into Trove to carry on.'),
          panel(
            `<p style="margin:0;text-align:center;font-family:Georgia,serif;font-size:32px;letter-spacing:6px;font-weight:600;color:${brand.brandDeep};">{{ .Token }}</p>`,
          ),
          p("It runs out soon. Didn't ask for it? Ignore this and change your password.", { muted: true, size: 14 }),
        ].join('\n'),
      ),
    },
  ];
}

// ---------------------------------------------------------------------------
// Emails sent by the send-email function through Resend
// ---------------------------------------------------------------------------

export type RenderedEmail = { subject: string; html: string; text: string };

export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}

export function welcomeEmail(input: {
  name: string | null;
  email: string;
  openUrl: string;
  siteUrl?: string;
}): RenderedEmail {
  const siteUrl = input.siteUrl ?? DEFAULT_SITE_URL;
  const first = firstName(input.name);
  const hi = first ? `${esc(first)}, you're in.` : "You're in.";
  const subject = first ? `${first}, welcome to Trove` : 'Welcome to Trove';

  const html = layout({
    title: subject,
    preheader: 'Three things to do today. Five minutes, tops.',
    markUrl: markUrl(siteUrl),
    footerNote: `You got this because you just made a Trove account with ${esc(input.email)}.`,
    body: [
      h1(hi),
      p('Here is the whole idea.'),
      p('<strong>One list. Everything with your name on it. From every part of your life.</strong>', { bold: false }),
      p('Do these three things today. Five minutes, tops:'),
      steps([
        '<strong>Empty your head.</strong> Every loose task goes on your list. All of it.',
        '<strong>Make a circle.</strong> The house. The club. The side business. Anything you share.',
        '<strong>Invite your people.</strong> Free. No per-person cost. Ever.',
      ]),
      p('Then open Trove each morning. Your list shows what is yours, from every circle, in one place.'),
      p('No more hunting through five apps.'),
      button('Open Trove', input.openUrl),
      p('Stuck? Hit reply. A real person reads every one.', { muted: true, size: 14 }),
      p('Luke<br><span style="color:#655B50;">Trove</span>'),
    ].join('\n'),
  });

  const text = [
    first ? `${first}, you're in.` : "You're in.",
    '',
    'Here is the whole idea.',
    'One list. Everything with your name on it. From every part of your life.',
    '',
    'Do these three things today. Five minutes, tops:',
    '1. Empty your head. Every loose task goes on your list. All of it.',
    '2. Make a circle. The house. The club. The side business. Anything you share.',
    '3. Invite your people. Free. No per-person cost. Ever.',
    '',
    'Then open Trove each morning. Your list shows what is yours, from every circle, in one place.',
    'No more hunting through five apps.',
    '',
    `Open Trove: ${input.openUrl}`,
    '',
    'Stuck? Hit reply. A real person reads every one.',
    '',
    'Luke',
    'Trove',
  ].join('\n');

  return { subject, html, text };
}

const ROLE_COPY: Record<string, string> = {
  admin: 'You join as an admin. You can add people and change any task.',
  member: 'You join as a member. You can add, edit and tick off tasks.',
  viewer: 'You join as a viewer. You can see the whole list.',
};

export function inviteEmail(input: {
  inviterName: string | null;
  circleName: string;
  inviteeEmail: string;
  role: string;
  joinUrl: string;
  getAppUrl: string;
  expiresAt: Date;
  siteUrl?: string;
}): RenderedEmail {
  const siteUrl = input.siteUrl ?? DEFAULT_SITE_URL;
  const inviter = (input.inviterName ?? '').trim() || 'Someone';
  const circle = input.circleName.trim() || 'a circle';
  const expires = input.expiresAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const subject = `${inviter} invited you to ${circle} on Trove`;
  const roleLine = ROLE_COPY[input.role] ?? ROLE_COPY.member;

  const html = layout({
    title: subject,
    preheader: `Join ${circle}. One shared list. Tasks with your name land on your list.`,
    markUrl: markUrl(siteUrl),
    footerNote: `${esc(inviter)} invited ${esc(input.inviteeEmail)} to a circle on Trove. Not expecting it? Ignore this email. Nothing happens unless you join.`,
    body: [
      h1(`${esc(inviter)} wants you in <span style="color:${brand.brandDeep};">${esc(circle)}</span>.`),
      p("It's a circle on Trove. A shared list for the people in it."),
      p('Everyone sees the same list. Anything with your name on it lands on <strong>your list</strong>, next to your own stuff.'),
      p(roleLine),
      button(`Join ${esc(circle)}`, input.joinUrl),
      panel(
        [
          `<p style="margin:0 0 8px;font-family:'Hanken Grotesk',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;font-weight:700;color:${brand.ink};">New to Trove?</p>`,
          steps([
            `<a href="${input.getAppUrl}" style="color:${brand.brand};font-weight:600;">Get the app.</a>`,
            `Sign up with <strong>${esc(input.inviteeEmail)}</strong>. The invite only works for this address.`,
            'Come back to this email. Tap the button again.',
          ]),
        ].join('\n'),
      ),
      p(`Tap it on the phone or Mac where Trove is installed. The invite runs out on ${expires}.`, { muted: true, size: 14 }),
      fallbackLink(input.joinUrl),
    ].join('\n'),
  });

  const text = [
    `${inviter} wants you in ${circle}.`,
    '',
    "It's a circle on Trove. A shared list for the people in it.",
    'Everyone sees the same list. Anything with your name on it lands on your list, next to your own stuff.',
    roleLine,
    '',
    `Join ${circle}: ${input.joinUrl}`,
    '',
    'New to Trove?',
    `1. Get the app: ${input.getAppUrl}`,
    `2. Sign up with ${input.inviteeEmail}. The invite only works for this address.`,
    '3. Come back to this email. Tap the link again.',
    '',
    `The invite runs out on ${expires}.`,
    'Not expecting it? Ignore this email. Nothing happens unless you join.',
  ].join('\n');

  return { subject, html, text };
}
