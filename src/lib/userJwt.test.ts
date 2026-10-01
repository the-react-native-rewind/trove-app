import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { isJwtAuthError, signSupabaseUserJwt } from './userJwt';

test('signSupabaseUserJwt is an HS256 token for the authenticated role', async () => {
  const secret = 'test-secret';
  const token = await signSupabaseUserJwt({
    userId: '11111111-1111-4111-8111-111111111111',
    secret,
    supabaseUrl: 'https://pxjqqogxemsmufopmlsv.supabase.co/',
    nowSeconds: 1_700_000_000,
    ttlSeconds: 3600,
  });
  const [header, body, signature] = token.split('.');
  assert.ok(header && body && signature);
  const payload = JSON.parse(decodeBase64Url(body));
  assert.equal(payload.sub, '11111111-1111-4111-8111-111111111111');
  assert.equal(payload.role, 'authenticated');
  assert.equal(payload.aud, 'authenticated');
  assert.equal(payload.iss, 'https://pxjqqogxemsmufopmlsv.supabase.co/auth/v1');
  assert.equal(payload.exp, 1_700_003_600);

  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  assert.equal(signature, expected);

  const tampered = `${header}.${body}.${expected.slice(0, -2)}aa`;
  const tamperedSig = tampered.split('.')[2];
  assert.ok(tamperedSig !== expected);
});

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

test('isJwtAuthError recognises PostgREST JWT failures', () => {
  assert.equal(isJwtAuthError({ code: 'PGRST301', message: 'JWT expired' }), true);
  assert.equal(isJwtAuthError({ message: 'JWSError: invalid signature' }), true);
  assert.equal(isJwtAuthError({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isJwtAuthError(null), false);
});
