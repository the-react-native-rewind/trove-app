// open: bounce an https link into the Trove app.
//
// Email clients (Gmail especially) strip trove:// links, so emails link here
// and this redirects to the app's deep link:
//   /functions/v1/open?to=invite/<token>  ->  trove://invite/<token>
//   /functions/v1/open                    ->  trove://
//
// verify_jwt: false. Public on purpose: it only maps an allow-listed path to
// the trove:// scheme and reads nothing. Supabase serves function GET
// responses as text/plain, so this is a 302, not an HTML page.

const ALLOWED = /^(invite\/[A-Za-z0-9]{16,128})?$/;

Deno.serve((req) => {
  const url = new URL(req.url);
  const to = (url.searchParams.get('to') ?? '').replace(/^\/+/, '');
  if (!ALLOWED.test(to)) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: `trove://${to}`, 'Cache-Control': 'no-store' },
  });
});
