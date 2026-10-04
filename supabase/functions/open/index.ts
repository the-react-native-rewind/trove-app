// open: old email links land here. Send them on to the website's /open page.
//
// Emails used to link to this function, which answered with a 302 straight to
// trove://invite/<token>. Browsers show a blank page for that whenever the app
// is not installed or the browser will not follow a redirect to a custom scheme
// (desktop Chrome, Gmail's in-app browser). Supabase serves function GET
// responses as text/plain, so this cannot be the landing page itself.
//
//   /functions/v1/open?to=invite/<token>  ->  <site>/open?to=invite%2F<token>
//   /functions/v1/open                    ->  <site>/open
//
// The website page offers "Open in Trove" (trove://invite/<token>) and the
// download links. New emails link to the website directly; this function stays
// so emails already sent keep working.
//
// verify_jwt: false. Public on purpose: it only maps an allow-listed path to a
// website URL and reads nothing.

import { APP_PATH, DEFAULT_SITE_URL, openPageUrl } from '../_shared/site.ts';

const SITE_URL = Deno.env.get('TROVE_SITE_URL') ?? DEFAULT_SITE_URL;

Deno.serve((req) => {
  const url = new URL(req.url);
  const to = (url.searchParams.get('to') ?? '').replace(/^\/+/, '');
  if (!APP_PATH.test(to)) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: openPageUrl(to, SITE_URL), 'Cache-Control': 'no-store' },
  });
});
