import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  API_TOKEN_PREFIX,
  API_TOKEN_PREFIX_LENGTH,
  TOKEN_TOUCH_INTERVAL_MS,
  apiTokenPrefix,
  buildApiToken,
  generateApiToken,
  hashApiToken,
  readBearerToken,
  tokenAccessDecision,
} from './apiToken';

test('hashApiToken is SHA-256 hex of the UTF-8 token', async () => {
  const expected = createHash('sha256').update('abc').digest('hex');
  assert.equal(await hashApiToken('abc'), expected);
  assert.equal(
    expected,
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(await hashApiToken('trove_a'), await hashApiToken('trove_a'));
  assert.ok((await hashApiToken('trove_a')) !== (await hashApiToken('trove_b')));
});

test('generateApiToken is a prefixed high-entropy secret', () => {
  const first = generateApiToken();
  const second = generateApiToken();
  assert.equal(first.startsWith(API_TOKEN_PREFIX), true);
  assert.ok(first.length >= 40);
  assert.equal(apiTokenPrefix(first).length, 12);
  assert.equal(apiTokenPrefix(first), first.slice(0, 12));
  assert.ok(first !== second);
});

test('buildApiToken encodes caller-supplied bytes into the digest the MCP server stores', async () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => i);
  const highBytes = Uint8Array.from({ length: 32 }, (_, i) => 128 + (i % 128));

  for (const sample of [bytes, highBytes]) {
    const token = generateApiToken(sample);
    assert.equal(token, legacyBase64UrlToken(sample));

    const { token: built, tokenHash } = await buildApiToken(sample, async (value) =>
      createHash('sha256').update(value).digest('hex'),
    );
    assert.equal(built, token);
    assert.equal(tokenHash, await hashApiToken(token));
    assert.equal(/^[0-9a-f]{64}$/.test(tokenHash), true);
    assert.equal(readBearerToken(`Bearer ${built}`), built);
    assert.equal(apiTokenPrefix(built), built.slice(0, API_TOKEN_PREFIX_LENGTH));
  }

  assert.equal(
    generateApiToken(bytes),
    'trove_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  );

  const upper = await buildApiToken(bytes, async (value) =>
    createHash('sha256').update(value).digest('hex').toUpperCase(),
  );
  assert.equal(upper.tokenHash, await hashApiToken(upper.token));

  let shortFailed = false;
  try {
    await buildApiToken(bytes.slice(0, 16), async () => 'ab'.repeat(32));
  } catch {
    shortFailed = true;
  }
  assert.equal(shortFailed, true);

  let badDigest = false;
  try {
    await buildApiToken(bytes, async () => 'not-a-sha256');
  } catch {
    badDigest = true;
  }
  assert.equal(badDigest, true);
});

function legacyBase64UrlToken(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return 'trove_' + btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

test('readBearerToken accepts only a Trove token', () => {
  const token = generateApiToken();
  assert.equal(readBearerToken(`Bearer ${token}`), token);
  assert.equal(readBearerToken(`bearer  ${token}`), token);
  assert.equal(readBearerToken(null), null);
  assert.equal(readBearerToken('Basic abc'), null);
  assert.equal(readBearerToken('Bearer eyJhbGciOiJIUzI1NiJ9.e30.sig'), null);
  assert.equal(readBearerToken('Bearer trove_short'), null);
});

test('tokenAccessDecision rejects missing and revoked tokens and throttles last_used writes', () => {
  const now = Date.parse('2026-10-01T12:00:00.000Z');
  assert.deepEqual(tokenAccessDecision(null, now), { ok: false, reason: 'invalid' });
  assert.deepEqual(
    tokenAccessDecision(
      { user_id: 'user-1', revoked_at: '2026-10-01T00:00:00.000Z', last_used_at: null },
      now,
    ),
    { ok: false, reason: 'revoked' },
  );
  assert.deepEqual(
    tokenAccessDecision({ user_id: 'user-1', revoked_at: null, last_used_at: null }, now),
    { ok: true, userId: 'user-1', touchLastUsed: true },
  );
  const recent = new Date(now - TOKEN_TOUCH_INTERVAL_MS + 1000).toISOString();
  assert.deepEqual(
    tokenAccessDecision({ user_id: 'user-1', revoked_at: null, last_used_at: recent }, now),
    { ok: true, userId: 'user-1', touchLastUsed: false },
  );
  const stale = new Date(now - TOKEN_TOUCH_INTERVAL_MS - 1).toISOString();
  assert.deepEqual(
    tokenAccessDecision({ user_id: 'user-1', revoked_at: null, last_used_at: stale }, now),
    { ok: true, userId: 'user-1', touchLastUsed: true },
  );
});
