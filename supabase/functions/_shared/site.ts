// Where Trove's https links land.
//
// Email clients and chat apps drop or refuse trove:// links, and a bare
// redirect to trove:// shows a blank page wherever the app is not installed
// (desktop browsers, Gmail's in-app browser, a phone without Trove). So every
// link we hand to a person is an https link to the website's /open page. That
// page has an "Open in Trove" button (trove://<path>) and the download links
// for people who do not have the app yet.
//
// No imports: the app, the node tests and the edge functions all load this.

export const DEFAULT_SITE_URL = 'https://troving.app';

/** Paths the app understands after trove://. Empty opens the app. */
export const APP_PATH = /^(invite\/[A-Za-z0-9]{16,128})?$/;

/** https://<site>/open?to=<path>, the page that hands <path> to the app. */
export function openPageUrl(path: string, siteUrl: string = DEFAULT_SITE_URL): string {
  const base = siteUrl.replace(/\/+$/, '');
  const to = path.replace(/^\/+/, '');
  return to ? `${base}/open?to=${encodeURIComponent(to)}` : `${base}/open`;
}

/** The https link for a circle invite. */
export function inviteUrl(token: string, siteUrl: string = DEFAULT_SITE_URL): string {
  return openPageUrl(`invite/${token}`, siteUrl);
}
