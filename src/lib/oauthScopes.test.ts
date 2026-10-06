import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeScope, splitScopes } from './oauthScopes';

test('OAuth scopes become a short list a person can read', () => {
  assert.deepEqual(splitScopes('openid email profile'), ['openid', 'email', 'profile']);
  assert.deepEqual(splitScopes('  '), []);
  assert.equal(describeScope('email'), 'See your email address');
  assert.equal(describeScope('circles:write'), 'circles:write');
});
