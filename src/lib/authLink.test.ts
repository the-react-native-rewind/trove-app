import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAuthCallback } from './authLink';

test('reads implicit recovery tokens from the hash', () => {
  const parsed = parseAuthCallback(
    'trove://reset-password#access_token=abc&refresh_token=def&type=recovery',
  );
  assert.deepEqual(parsed, {
    accessToken: 'abc',
    refreshToken: 'def',
    code: null,
    type: 'recovery',
  });
});

test('reads a PKCE code from the query', () => {
  const parsed = parseAuthCallback('trove://reset-password?code=xyz&type=recovery');
  assert.equal(parsed?.code, 'xyz');
  assert.equal(parsed?.type, 'recovery');
});

test('ignores urls that are not auth callbacks', () => {
  assert.equal(parseAuthCallback('trove://invite/token'), null);
  assert.equal(parseAuthCallback(null), null);
});
