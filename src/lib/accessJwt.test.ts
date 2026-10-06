import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decideAccessClaims, verifySupabaseAccessJwt } from '../../supabase/functions/_shared/accessJwt';

const SUPABASE = 'https://pxjqqogxemsmufopmlsv.supabase.co';
const RESOURCE = 'https://mcp.example.com';
const USER = '11111111-1111-4111-8111-111111111111';
const CLIENT = '22222222-2222-4222-8222-222222222222';
const NOW = 1_700_000_000;

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: `${SUPABASE}/auth/v1`,
    sub: USER,
    aud: 'authenticated',
    exp: NOW + 3600,
    role: 'authenticated',
    client_id: CLIENT,
    scope: 'openid email',
    ...overrides,
  };
}

test('OAuth access tokens must be this project, this user, and an OAuth client', () => {
  const ok = decideAccessClaims(claims(), { supabaseUrl: SUPABASE, resource: RESOURCE, nowSeconds: NOW });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.userId, USER);
  assert.equal(ok.clientId, CLIENT);
  assert.deepEqual(ok.scopes, ['openid', 'email']);

  const resourceAud = decideAccessClaims(claims({ aud: [RESOURCE, 'authenticated'] }), {
    supabaseUrl: SUPABASE,
    resource: RESOURCE,
    nowSeconds: NOW,
  });
  assert.equal(resourceAud.ok, true);

  assert.equal(decideAccessClaims(claims({ client_id: '' }), { supabaseUrl: SUPABASE, resource: RESOURCE, nowSeconds: NOW }).ok, false);
  assert.equal(
    decideAccessClaims(claims({ client_id: undefined }), { supabaseUrl: SUPABASE, resource: RESOURCE, nowSeconds: NOW }).ok,
    false,
  );
  const missing = decideAccessClaims(claims({ client_id: undefined }), {
    supabaseUrl: SUPABASE,
    resource: RESOURCE,
    nowSeconds: NOW,
  });
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.reason, 'missing_client');

  const expired = decideAccessClaims(claims({ exp: NOW - 120 }), { supabaseUrl: SUPABASE, resource: RESOURCE, nowSeconds: NOW });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.reason, 'expired');

  const anon = decideAccessClaims(claims({ role: 'anon' }), { supabaseUrl: SUPABASE, resource: RESOURCE, nowSeconds: NOW });
  assert.equal(anon.ok, false);
  if (!anon.ok) assert.equal(anon.reason, 'not_user');

  const other = decideAccessClaims(claims({ iss: 'https://evil.example/auth/v1' }), {
    supabaseUrl: SUPABASE,
    resource: RESOURCE,
    nowSeconds: NOW,
  });
  assert.equal(other.ok, false);
  if (!other.ok) assert.equal(other.reason, 'wrong_issuer');

  const audience = decideAccessClaims(claims({ aud: 'someone-else' }), {
    supabaseUrl: SUPABASE,
    resource: RESOURCE,
    nowSeconds: NOW,
  });
  assert.equal(audience.ok, false);
  if (!audience.ok) assert.equal(audience.reason, 'wrong_audience');
});

test('a signed ES256 access token verifies against the matching JWKS key', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey & { kid?: string; alg?: string };
  jwk.kid = 'test-key';
  jwk.alg = 'ES256';
  const token = await signEs256(pair.privateKey, 'test-key', claims());
  const verified = await verifySupabaseAccessJwt(token, {
    supabaseUrl: SUPABASE,
    resource: RESOURCE,
    nowSeconds: NOW,
    jwks: { keys: [jwk] },
  });
  assert.equal(verified.ok, true);

  const tampered = `${token.slice(0, -2)}aa`;
  const bad = await verifySupabaseAccessJwt(tampered, {
    supabaseUrl: SUPABASE,
    resource: RESOURCE,
    nowSeconds: NOW,
    jwks: { keys: [jwk] },
  });
  assert.equal(bad.ok, false);
});

async function signEs256(key: CryptoKey, kid: string, payload: object): Promise<string> {
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid })));
  const body = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const data = new TextEncoder().encode(`${header}.${body}`);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data);
  return `${header}.${body}.${base64Url(new Uint8Array(signature))}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
