import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  UNASSIGNED_FILTER,
  isAssignedToUser,
  normalizeAssignees,
  taskMatchesAssigneeFilter,
} from './assignees';

test('a task is mine when the signed-in person is any assignee', () => {
  assert.equal(isAssignedToUser(['user-1'], 'user-1'), true);
  assert.equal(isAssignedToUser(['user-2', 'user-1'], 'user-1'), true);
  assert.equal(isAssignedToUser(['user-2'], 'user-1'), false);
  assert.equal(isAssignedToUser([], 'user-1'), false);
  assert.equal(isAssignedToUser(['user-1'], null), false);
});

test('an empty assignee filter shows every task', () => {
  assert.equal(taskMatchesAssigneeFilter(['alex'], new Set()), true);
  assert.equal(taskMatchesAssigneeFilter([], new Set()), true);
});

test('assignee filters match any selected person, including nobody', () => {
  const selected = new Set(['sam', UNASSIGNED_FILTER]);
  assert.equal(taskMatchesAssigneeFilter(['alex', 'sam'], selected), true);
  assert.equal(taskMatchesAssigneeFilter([], selected), true);
  assert.equal(taskMatchesAssigneeFilter(['alex'], selected), false);
});

test('assignee links keep position order', () => {
  assert.deepEqual(
    normalizeAssignees([
      { position: 1, profile: { id: 'sam', display_name: 'Sam', avatar_url: null } },
      { position: 0, profile: [{ id: 'alex', display_name: 'Alex', avatar_url: null }] },
      { position: 2, profile: null },
    ]).map((person) => person.id),
    ['alex', 'sam'],
  );
});
