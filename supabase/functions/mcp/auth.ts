// Resolve a Trove personal access token to a Supabase user, then to a user
// access token so later queries run as that person and RLS applies.
//
// The service role is used only to look up the token hash, stamp last_used_at,
// and (when the legacy JWT secret is missing or rejected) mint a real session.
// Task and circle queries never use the service role.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { hashApiToken, tokenAccessDecision } from '../../../src/lib/apiToken.ts';
import { isJwtAuthError, signSupabaseUserJwt } from '../../../src/lib/userJwt.ts';

type Env = {
  url: string;
  anonKey: string;
  serviceKey: string;
};

type CachedAccess = { token: string; expMs: number };

const accessCache = new Map<string, CachedAccess>();
const inflight = new Map<string, Promise<string>>();
let jwtSecretRejected = false;

export type AuthedCaller = { userId: string; accessToken: string };

export async function authenticate(rawToken: string): Promise<AuthedCaller | null> {
  const env = readEnv();
  const admin = serviceClient(env);
  const tokenHash = await hashApiToken(rawToken);
  const { data, error } = await admin
    .from('api_tokens')
    .select('user_id, revoked_at, last_used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) {
    console.error('api token lookup failed', error.code ?? error.message);
    return null;
  }

  const decision = tokenAccessDecision(
    data
      ? {
          user_id: data.user_id,
          revoked_at: data.revoked_at,
          last_used_at: data.last_used_at,
        }
      : null,
  );
  if (!decision.ok) return null;

  if (decision.touchLastUsed) {
    const { error: touchError } = await admin
      .from('api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .is('revoked_at', null);
    if (touchError) console.error('api token last_used_at update failed', touchError.message);
  }

  const accessToken = await accessTokenFor(env, decision.userId);
  return { userId: decision.userId, accessToken };
}

export function userClient(env: Env, accessToken: string): SupabaseClient {
  return createClient(env.url, env.anonKey, {
    accessToken: async () => accessToken,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function readEnv(): Env {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Supabase environment is not configured');
  }
  return { url, anonKey, serviceKey };
}

function serviceClient(env: Env): SupabaseClient {
  return createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function accessTokenFor(env: Env, userId: string): Promise<string> {
  const cached = accessCache.get(userId);
  if (cached && cached.expMs > Date.now() + 60_000) return cached.token;

  const pending = inflight.get(userId);
  if (pending) return pending;

  const promise = mintAccessToken(env, userId).finally(() => inflight.delete(userId));
  inflight.set(userId, promise);
  return promise;
}

async function mintAccessToken(env: Env, userId: string): Promise<string> {
  const secret = Deno.env.get('SUPABASE_JWT_SECRET');
  if (secret && !jwtSecretRejected) {
    const jwt = await signSupabaseUserJwt({ userId, secret, supabaseUrl: env.url });
    const probe = userClient(env, jwt);
    const { error } = await probe.from('profiles').select('id').eq('id', userId).limit(1).maybeSingle();
    if (!error) {
      const expMs = Date.now() + 55 * 60 * 1000;
      accessCache.set(userId, { token: jwt, expMs });
      return jwt;
    }
    if (!isJwtAuthError(error)) throw new Error(error.message);
    jwtSecretRejected = true;
    console.error('SUPABASE_JWT_SECRET was rejected; falling back to a user session');
  }

  const session = await mintSession(env, userId);
  accessCache.set(userId, session);
  return session.token;
}

async function mintSession(env: Env, userId: string): Promise<CachedAccess> {
  const admin = serviceClient(env);
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (userError || !email) {
    throw new Error('Could not open a session for this token');
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    throw new Error('Could not open a session for this token');
  }

  const anon = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  const session = verified?.session;
  if (verifyError || !session?.access_token) {
    throw new Error('Could not open a session for this token');
  }

  const expMs = session.expires_at ? session.expires_at * 1000 : Date.now() + 50 * 60 * 1000;
  return { token: session.access_token, expMs };
}
