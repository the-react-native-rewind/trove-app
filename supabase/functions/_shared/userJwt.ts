/**
 * Mint a short-lived Supabase user JWT locally so PostgREST applies that
 * person's RLS. The signing material is a function secret, never a file in
 * the repo, and this never creates an Auth session.
 *
 * SUPABASE_JWT_SECRET is the legacy HS256 JWT secret.
 * SUPABASE_JWT_SIGNING_KEY is a private JWK (ES256, RS256, or oct HS256)
 * for a signing key you generated and imported. When it is set, it wins.
 */

export class ServerMisconfiguredError extends Error {
  constructor() {
    super('server_misconfigured');
    this.name = 'ServerMisconfiguredError';
  }
}

export type JwtSigningConfig =
  | { alg: 'HS256'; secret: string }
  | { alg: 'ES256' | 'RS256'; jwk: JsonWebKey; kid: string };

export type UserJwtInput = {
  userId: string;
  supabaseUrl: string;
  nowSeconds?: number;
  ttlSeconds?: number;
  /** Legacy HS256 secret. Ignored when `signing` is set. */
  secret?: string;
  signing?: JwtSigningConfig;
};

type PrivateJwk = JsonWebKey & { kid?: string; kty?: string; crv?: string; k?: string };

export function resolveJwtSigningConfig(input: {
  jwtSecret?: string | null;
  signingKey?: string | null;
}): JwtSigningConfig {
  const signingKey = input.signingKey?.trim();
  if (signingKey) return parseSigningKey(signingKey);
  const secret = input.jwtSecret?.trim();
  if (secret) return { alg: 'HS256', secret };
  throw new ServerMisconfiguredError();
}

export async function signSupabaseUserJwt(input: UserJwtInput): Promise<string> {
  const signing = input.signing ?? (input.secret ? { alg: 'HS256' as const, secret: input.secret } : null);
  if (!signing) throw new ServerMisconfiguredError();

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? 60 * 60;
  const iss = `${input.supabaseUrl.replace(/\/$/, '')}/auth/v1`;
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: input.userId,
    iss,
    iat: now,
    exp: now + ttl,
    aal: 'aal1',
  };

  if (signing.alg === 'HS256') {
    return signHs256(payload, signing.secret);
  }
  return signAsymmetric(payload, signing);
}

export function isJwtAuthError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST301' || error.code === 'PGRST300') return true;
  return /jwt|jws|invalid signature/i.test(error.message ?? '');
}

function parseSigningKey(raw: string): JwtSigningConfig {
  let parsed: PrivateJwk;
  try {
    parsed = JSON.parse(raw) as PrivateJwk;
  } catch {
    throw new ServerMisconfiguredError();
  }
  if (!parsed || typeof parsed !== 'object') throw new ServerMisconfiguredError();

  if (parsed.kty === 'oct' && parsed.k) {
    const secret = new TextDecoder().decode(base64UrlDecode(parsed.k));
    if (!secret) throw new ServerMisconfiguredError();
    return { alg: 'HS256', secret };
  }

  const kid = parsed.kid?.trim();
  if (!kid) throw new ServerMisconfiguredError();

  if (parsed.kty === 'EC' && parsed.crv === 'P-256' && parsed.d && parsed.x && parsed.y) {
    return { alg: 'ES256', kid, jwk: parsed };
  }
  if (parsed.kty === 'RSA' && parsed.n && parsed.e && parsed.d) {
    return { alg: 'RS256', kid, jwk: parsed };
  }
  throw new ServerMisconfiguredError();
}

function signingJwk(signing: Extract<JwtSigningConfig, { jwk: JsonWebKey }>): JsonWebKey {
  const { key_ops: _keyOps, ext: _ext, ...jwk } = signing.jwk;
  return { ...jwk, alg: signing.alg };
}

async function signAsymmetric(
  payload: object,
  signing: Extract<JwtSigningConfig, { jwk: JsonWebKey }>,
): Promise<string> {
  const header = { alg: signing.alg, typ: 'JWT', kid: signing.kid };
  const encodedHeader = base64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const jwk = signingJwk(signing);

  const signature =
    signing.alg === 'ES256'
      ? await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
          data,
        )
      : await crypto.subtle.sign(
          'RSASSA-PKCS1-v1_5',
          await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']),
          data,
        );

  return `${encodedHeader}.${encodedPayload}.${base64Url(new Uint8Array(signature))}`;
}

async function signHs256(payload: object, secret: string): Promise<string> {
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${base64Url(new Uint8Array(signature))}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
