import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  OAUTH_SESSION_CACHE_MS,
  clearOauthSessionCache,
  oauthSessionIsActive,
} from '../../supabase/functions/_shared/oauthSession';

const SESSION = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'header.payload.sig';

function jsonResponse(status: number): Response {
  return new Response(status === 200 ? '{"id":"user"}' : '{"error":"no"}', { status });
}

test('a revoked OAuth session is rejected, and a live one is remembered for a minute', async () => {
  clearOauthSessionCache();
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return jsonResponse(200);
  };

  const first = await oauthSessionIsActive({
    token: TOKEN,
    sessionId: SESSION,
    supabaseUrl: 'https://example.supabase.co',
    apiKey: 'anon',
    nowMs: 1_000,
    fetchImpl,
  });
  const second = await oauthSessionIsActive({
    token: TOKEN,
    sessionId: SESSION,
    supabaseUrl: 'https://example.supabase.co',
    apiKey: 'anon',
    nowMs: 1_000 + OAUTH_SESSION_CACHE_MS - 1,
    fetchImpl,
  });
  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(calls, 1);

  clearOauthSessionCache();
  let revokedCalls = 0;
  const revoked: typeof fetch = async (input) => {
    revokedCalls += 1;
    const url = String(input);
    assert.equal(url, 'https://example.supabase.co/auth/v1/user');
    return jsonResponse(401);
  };
  const dead = await oauthSessionIsActive({
    token: TOKEN,
    sessionId: SESSION,
    supabaseUrl: 'https://example.supabase.co/',
    apiKey: 'anon',
    nowMs: 5_000,
    fetchImpl: revoked,
  });
  const stillDead = await oauthSessionIsActive({
    token: TOKEN,
    sessionId: SESSION,
    supabaseUrl: 'https://example.supabase.co/',
    apiKey: 'anon',
    nowMs: 5_000 + 1_000,
    fetchImpl: revoked,
  });
  assert.equal(dead, false);
  assert.equal(stillDead, false);
  assert.equal(revokedCalls, 1);
});

test('an Auth outage is not cached as a revoked session', async () => {
  clearOauthSessionCache();
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return jsonResponse(503);
  };
  const first = await oauthSessionIsActive({
    token: TOKEN,
    sessionId: SESSION,
    supabaseUrl: 'https://example.supabase.co',
    apiKey: 'anon',
    nowMs: 9_000,
    fetchImpl,
  });
  const second = await oauthSessionIsActive({
    token: TOKEN,
    sessionId: SESSION,
    supabaseUrl: 'https://example.supabase.co',
    apiKey: 'anon',
    nowMs: 9_100,
    fetchImpl,
  });
  assert.equal(first, false);
  assert.equal(second, false);
  assert.equal(calls, 2);
});
