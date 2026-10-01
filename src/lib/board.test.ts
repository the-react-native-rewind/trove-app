import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupByStatus, normalizeStatus, sortTasksByUrgency } from './board';
import type { TaskWithRefs } from './types';

function task(overrides: Partial<TaskWithRefs> & { id: string }): TaskWithRefs {
  return {
    space_id: 'space',
    title: overrides.id,
    description: null,
    status: 'todo',
    assignee_id: null,
    priority: null,
    due_date: null,
    position: 1,
    created_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    space: null,
    assignee: null,
    ...overrides,
  } as TaskWithRefs;
}

test('legacy and unknown statuses stay visible as To do', () => {
  assert.equal(normalizeStatus('backlog'), 'todo');
  assert.equal(normalizeStatus('mystery'), 'todo');
  assert.equal(normalizeStatus('in_progress'), 'in_progress');
  assert.equal(normalizeStatus('done'), 'done');
});

test('urgency puts the earliest due date first, then priority', () => {
  const sorted = sortTasksByUrgency([
    task({ id: 'later', due_date: '2026-05-02', priority: 'high' }),
    task({ id: 'sooner-low', due_date: '2026-05-01', priority: 'low' }),
    task({ id: 'sooner-high', due_date: '2026-05-01', priority: 'high' }),
    task({ id: 'undated', due_date: null, priority: 'high' }),
  ]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['sooner-high', 'sooner-low', 'later', 'undated'],
  );
});

test('grouping folds a legacy status into To do', () => {
  const groups = groupByStatus([task({ id: 'old', status: 'backlog' as never })]);
  assert.equal(groups.todo[0]?.id, 'old');
  assert.equal(groups.in_progress.length, 0);
});
