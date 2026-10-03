import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyBulkPatch, patchCachedTasks, type BulkPatch } from './bulk';

const task = {
  id: 'a',
  status: 'todo',
  assignee_id: 'sam',
  assignee: { id: 'sam', display_name: 'Sam', avatar_url: null },
  title: 'Water',
};

test('complete marks only the chosen tasks done', () => {
  const patch: BulkPatch = { ids: new Set(['a']), status: 'done' };
  const next = applyBulkPatch(task, patch);
  assert.equal(next.status, 'done');
  assert.equal(next.assignee_id, 'sam');
  assert.equal(applyBulkPatch({ ...task, id: 'b' }, patch).status, 'todo');
});

test('unassign clears the person and leaves status', () => {
  const next = applyBulkPatch(task, {
    ids: new Set(['a']),
    setAssignee: true,
    assigneeId: null,
    assignee: null,
  });
  assert.equal(next.status, 'todo');
  assert.equal(next.assignee_id, null);
  assert.equal(next.assignee, null);
});

test('cached lists and a single task row both update', () => {
  const patch: BulkPatch = {
    ids: new Set(['a']),
    setAssignee: true,
    assigneeId: 'alex',
    assignee: { id: 'alex', display_name: 'Alex', avatar_url: null },
  };
  const list = patchCachedTasks([task, { ...task, id: 'b' }], patch) as typeof task[];
  assert.equal(list[0]?.assignee_id, 'alex');
  assert.equal(list[1]?.assignee_id, 'sam');
  const single = patchCachedTasks(task, patch) as typeof task;
  assert.equal(single.assignee?.display_name, 'Alex');
  assert.equal(patchCachedTasks(null, patch), null);
});
