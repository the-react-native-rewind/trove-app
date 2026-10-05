import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyBulkPatch, patchCachedTasks, type BulkPatch } from './bulk';

const task = {
  id: 'a',
  status: 'todo',
  assignees: [{ id: 'sam', display_name: 'Sam', avatar_url: null }],
  title: 'Water',
};

test('complete marks only the chosen tasks done', () => {
  const patch: BulkPatch = { ids: new Set(['a']), status: 'done' };
  const next = applyBulkPatch(task, patch);
  assert.equal(next.status, 'done');
  assert.equal(next.assignees[0]?.id, 'sam');
  assert.equal(applyBulkPatch({ ...task, id: 'b' }, patch).status, 'todo');
});

test('unassign clears every person and leaves status', () => {
  const next = applyBulkPatch(task, {
    ids: new Set(['a']),
    setAssignees: true,
    assignees: [],
  });
  assert.equal(next.status, 'todo');
  assert.deepEqual(next.assignees, []);
});

test('cached lists and a single task row both take the new set', () => {
  const patch: BulkPatch = {
    ids: new Set(['a']),
    setAssignees: true,
    assignees: [
      { id: 'alex', display_name: 'Alex', avatar_url: null },
      { id: 'sam', display_name: 'Sam', avatar_url: null },
    ],
  };
  const list = patchCachedTasks([task, { ...task, id: 'b' }], patch) as typeof task[];
  assert.deepEqual(
    list[0]?.assignees.map((person) => person.id),
    ['alex', 'sam'],
  );
  assert.equal(list[1]?.assignees[0]?.id, 'sam');
  const single = patchCachedTasks(task, patch) as typeof task;
  assert.equal(single.assignees[0]?.display_name, 'Alex');
  assert.equal(patchCachedTasks(null, patch), null);
});
