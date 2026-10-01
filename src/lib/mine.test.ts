import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isAssignedToUser, MINE_VIEW_ID } from './mine';

test('Mine keeps the existing view id', () => {
  assert.equal(MINE_VIEW_ID, 'all');
});

test('a task is mine only when the assignee is the signed-in person', () => {
  assert.equal(isAssignedToUser('user-1', 'user-1'), true);
  assert.equal(isAssignedToUser('user-2', 'user-1'), false);
  assert.equal(isAssignedToUser(null, 'user-1'), false);
  assert.equal(isAssignedToUser('user-1', null), false);
});
