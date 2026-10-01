import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { isJwtAuthError, resolveJwtSigningConfig, ServerMisconfiguredError, signSupabaseUserJwt } from './userJwt';

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
  return new TextDecoder().decode(base64UrlBytes(value));
}

function base64UrlBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

test('a missing signing secret is server_misconfigured', () => {
  for (const input of [{ jwtSecret: '  ', signingKey: null }, {}]) {
    let failed = false;
    try {
      resolveJwtSigningConfig(input);
    } catch (error) {
      failed = error instanceof ServerMisconfiguredError;
    }
    assert.equal(failed, true);
  }
});

test('an imported ES256 signing key is preferred over the legacy secret', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = { ...(await crypto.subtle.exportKey('jwk', pair.privateKey)), kid: 'imported-key' };
  const signing = resolveJwtSigningConfig({
    jwtSecret: 'legacy-secret',
    signingKey: JSON.stringify(privateJwk),
  });
  assert.equal(signing.alg, 'ES256');
  if (signing.alg !== 'ES256') return;
  assert.equal(signing.kid, 'imported-key');

  const token = await signSupabaseUserJwt({
    userId: '11111111-1111-4111-8111-111111111111',
    supabaseUrl: 'https://pxjqqogxemsmufopmlsv.supabase.co',
    nowSeconds: 1_700_000_000,
    signing,
  });
  const [headerPart, bodyPart, signaturePart] = token.split('.');
  assert.ok(headerPart && bodyPart && signaturePart);
  const header = JSON.parse(decodeBase64Url(headerPart));
  assert.equal(header.alg, 'ES256');
  assert.equal(header.kid, 'imported-key');
  assert.equal(header.typ, 'JWT');

  const signature = base64UrlBytes(signaturePart);
  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.publicKey,
    signature.buffer.slice(signature.byteOffset, signature.byteOffset + signature.byteLength) as ArrayBuffer,
    new TextEncoder().encode(`${headerPart}.${bodyPart}`),
  );
  assert.equal(verified, true);
});

test('a signing key without a kid cannot be used', () => {
  let failed = false;
  try {
    resolveJwtSigningConfig({
      signingKey: JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'aa', y: 'bb', d: 'cc' }),
    });
  } catch (error) {
    failed = error instanceof ServerMisconfiguredError;
  }
  assert.equal(failed, true);
});

test('isJwtAuthError recognises PostgREST JWT failures', () => {
  assert.equal(isJwtAuthError({ code: 'PGRST301', message: 'JWT expired' }), true);
  assert.equal(isJwtAuthError({ message: 'JWSError: invalid signature' }), true);
  assert.equal(isJwtAuthError({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isJwtAuthError(null), false);
});
