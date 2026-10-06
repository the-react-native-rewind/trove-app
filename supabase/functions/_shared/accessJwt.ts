/**
 * Validate a Supabase Auth access token for the MCP resource server.
 *
 * OAuth access tokens are ordinary user JWTs. Passing a verified one to
 * PostgREST applies that person's row level security. Personal trove_ tokens
 * never come through here; they are hashed and exchanged for a minted JWT.
 *
 * Audience binding to the MCP resource URL is not enforced as a requirement.
 * Supabase Auth still sets aud to "authenticated" and ignores the RFC 8707
 * resource parameter (supabase/auth#2610). A token whose audience is the
 * resource URL is accepted too, so the check keeps working when that lands.
 * client_id is required so a first-party session JWT (no OAuth grant) is not
 * treated as an assistant connection.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOCK_SKEW_SECONDS = 60;

export type JsonWebKeySet = { keys: JsonWebKey[] };

export type AccessJwtOk = {
  ok: true;
  userId: string;
  clientId: string;
  sessionId: string;
  expiresAt: number;
  scopes: string[];
};

export type AccessJwtFailure = {
  ok: false;
  reason:
    | 'malformed'
    | 'bad_signature'
    | 'expired'
    | 'wrong_issuer'
    | 'wrong_audience'
    | 'not_user'
    | 'missing_client'
    | 'missing_session';
};

export type AccessJwtResult = AccessJwtOk | AccessJwtFailure;

type JwtHeader = { alg?: string; kid?: string };
type JwtPayload = {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  role?: string;
  client_id?: string;
  scope?: string;
  session_id?: string;
};

export async function verifySupabaseAccessJwt(
  token: string,
  options: {
    supabaseUrl: string;
    resource: string;
    nowSeconds?: number;
    jwks: JsonWebKeySet;
  },
): Promise<AccessJwtResult> {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return { ok: false, reason: 'malformed' };

  let header: JwtHeader;
  let payload: JwtPayload;
  try {
    header = decodeJson(encodedHeader) as JwtHeader;
    payload = decodeJson(encodedPayload) as JwtPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
    return { ok: false, reason: 'malformed' };
  }
  if (header.alg !== 'ES256' && header.alg !== 'RS256') return { ok: false, reason: 'bad_signature' };

  const key = selectKey(options.jwks.keys, header);
  if (!key) return { ok: false, reason: 'bad_signature' };

  const signed = await verifySignature(header.alg, key, `${encodedHeader}.${encodedPayload}`, encodedSignature);
  if (!signed) return { ok: false, reason: 'bad_signature' };

  return decideAccessClaims(payload, options);
}

export function decideAccessClaims(
  payload: JwtPayload,
  options: { supabaseUrl: string; resource: string; nowSeconds?: number },
): AccessJwtResult {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const issuer = `${options.supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
  if (payload.iss !== issuer) return { ok: false, reason: 'wrong_issuer' };
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < now) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > now) {
    return { ok: false, reason: 'expired' };
  }
  if (payload.role !== 'authenticated') return { ok: false, reason: 'not_user' };
  if (!audienceAllows(payload.aud, options.resource)) return { ok: false, reason: 'wrong_audience' };
  if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) return { ok: false, reason: 'malformed' };

  const clientId = payload.client_id?.trim() ?? '';
  if (!clientId || clientId.length > 200 || /\s/.test(clientId)) {
    return { ok: false, reason: 'missing_client' };
  }

  const sessionId = payload.session_id?.trim() ?? '';
  if (!UUID.test(sessionId)) return { ok: false, reason: 'missing_session' };

  const scopes = typeof payload.scope === 'string'
    ? payload.scope.split(/\s+/).filter((scope) => scope.length > 0)
    : ['openid'];

  return { ok: true, userId: payload.sub, clientId, sessionId, expiresAt: payload.exp, scopes };
}

function audienceAllows(aud: string | string[] | undefined, resource: string): boolean {
  const values = Array.isArray(aud) ? aud : aud ? [aud] : [];
  const resourceTrimmed = resource.replace(/\/+$/, '');
  return values.some((value) => value === 'authenticated' || value.replace(/\/+$/, '') === resourceTrimmed);
}

type SigningJwk = JsonWebKey & { kid?: string };

function selectKey(keys: JsonWebKey[], header: JwtHeader): SigningJwk | undefined {
  const usable = keys.filter((key): key is SigningJwk => key.kty === 'EC' || key.kty === 'RSA');
  if (header.kid) return usable.find((key) => key.kid === header.kid);
  return usable.length === 1 ? usable[0] : undefined;
}

async function verifySignature(alg: 'ES256' | 'RS256', jwk: SigningJwk, data: string, signature: string): Promise<boolean> {
  const bytes = new TextEncoder().encode(data);
  const sig = base64UrlDecode(signature);
  if (alg === 'ES256') {
    if (jwk.kty !== 'EC') return false;
    const key = await crypto.subtle.importKey('jwk', publicJwk(jwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, bytes);
  }
  if (jwk.kty !== 'RSA') return false;
  const key = await crypto.subtle.importKey('jwk', publicJwk(jwk), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, bytes);
}

function publicJwk(jwk: JsonWebKey): JsonWebKey {
  const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, key_ops: _ops, ...rest } = jwk;
  return rest;
}

function decodeJson(segment: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const jwksCache = new Map<string, { expiresAtMs: number; keys: JsonWebKey[] }>();

/** Cached JWKS for the Deno handler. Tests call verifySupabaseAccessJwt with a key set directly. */
export async function loadSupabaseJwks(
  supabaseUrl: string,
  fetchImpl: typeof fetch = fetch,
  nowMs: number = Date.now(),
): Promise<JsonWebKeySet> {
  const base = supabaseUrl.replace(/\/+$/, '');
  const cached = jwksCache.get(base);
  if (cached && cached.expiresAtMs > nowMs) return { keys: cached.keys };

  const response = await fetchImpl(`${base}/auth/v1/.well-known/jwks.json`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Could not load the authorization server signing keys (${response.status}).`);
  const body = (await response.json()) as { keys?: JsonWebKey[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache.set(base, { expiresAtMs: nowMs + 10 * 60 * 1000, keys });
  return { keys };
}

export function clearJwksCache(): void {
  jwksCache.clear();
}
