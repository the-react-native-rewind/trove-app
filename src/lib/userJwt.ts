/**
 * Mint a short-lived Supabase user JWT (HS256) so PostgREST applies that
 * person's RLS. Used only when the edge function has SUPABASE_JWT_SECRET.
 * The secret never lives in the repo.
 */

export type UserJwtInput = {
  userId: string;
  secret: string;
  supabaseUrl: string;
  nowSeconds?: number;
  ttlSeconds?: number;
};

export async function signSupabaseUserJwt(input: UserJwtInput): Promise<string> {
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
  return signHs256(payload, input.secret);
}

export function isJwtAuthError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST301' || error.code === 'PGRST300') return true;
  return /jwt|jws|invalid signature/i.test(error.message ?? '');
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
