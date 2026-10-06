/**
 * OAuth access tokens are JWTs. A local signature check stays valid until
 * `exp`, which is about an hour, even after the person revokes the grant.
 * Revoke deletes that Auth session, so this asks GoTrue whether the session
 * is still there. The answer is remembered for a minute so a busy assistant
 * does not call Auth on every tool request.
 *
 * Personal trove_ tokens do not come through here. They are checked against
 * api_tokens on each use.
 */

export const OAUTH_SESSION_CACHE_MS = 60_000;

type CacheEntry = { active: boolean; expiresAtMs: number };

const cache = new Map<string, CacheEntry>();

export function clearOauthSessionCache(): void {
  cache.clear();
}

export async function oauthSessionIsActive(input: {
  token: string;
  sessionId: string;
  supabaseUrl: string;
  apiKey: string;
  nowMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const now = input.nowMs ?? Date.now();
  const cached = cache.get(input.sessionId);
  if (cached && cached.expiresAtMs > now) return cached.active;

  const fetchImpl = input.fetchImpl ?? fetch;
  const base = input.supabaseUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetchImpl(`${base}/auth/v1/user`, {
      headers: {
        authorization: `Bearer ${input.token}`,
        apikey: input.apiKey,
        accept: 'application/json',
      },
    });
  } catch (error) {
    console.error('oauth session check failed', error instanceof Error ? error.message : error);
    return false;
  }

  if (response.status === 200) {
    cache.set(input.sessionId, { active: true, expiresAtMs: now + OAUTH_SESSION_CACHE_MS });
    return true;
  }
  if (response.status === 401 || response.status === 403) {
    cache.set(input.sessionId, { active: false, expiresAtMs: now + OAUTH_SESSION_CACHE_MS });
    return false;
  }
  console.error('oauth session check returned', response.status);
  return false;
}
