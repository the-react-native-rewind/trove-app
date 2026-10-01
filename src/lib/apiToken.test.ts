import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  API_TOKEN_PREFIX,
  TOKEN_TOUCH_INTERVAL_MS,
  apiTokenPrefix,
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
