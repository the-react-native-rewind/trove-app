export type AuthCallback = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  type: string | null;
};

/** Pull a Supabase auth redirect (implicit tokens or PKCE code) out of a URL. */
export function parseAuthCallback(url: string | null | undefined): AuthCallback | null {
  if (!url) return null;
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const query =
    queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : '';
  const params = new URLSearchParams(hash || query);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const code = params.get('code');
  const type = params.get('type');
  if (!accessToken && !code) return null;
  return { accessToken, refreshToken, code, type };
}
