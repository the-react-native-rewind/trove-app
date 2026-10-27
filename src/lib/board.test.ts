import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupByStatus, listBucket, normalizeStatus, sortTasksByUrgency } from './board';
import { rankAfterDrop } from './rank';
import { STATUSES, type TaskWithRefs } from './types';

function task(overrides: Partial<TaskWithRefs> & { id: string }): TaskWithRefs {
  return {
    space_id: 'space',
    title: overrides.id,
    description: null,
    status: 'todo',
    assignees: [],
    priority: null,
    rank: 'a0',
    due_date: null,
    position: 1,
    created_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    space: null,
    ...overrides,
  } as TaskWithRefs;
}

test('known statuses stay themselves and unknown values stay open', () => {
  assert.equal(normalizeStatus('backlog'), 'todo');
  assert.equal(normalizeStatus('in_progress'), 'in_progress');
  assert.equal(normalizeStatus('mystery'), 'todo');
  assert.equal(normalizeStatus('done'), 'done');
  assert.equal(listBucket('in_progress'), 'todo');
  assert.equal(listBucket('todo'), 'todo');
  assert.equal(listBucket('done'), 'done');
  assert.deepEqual(
    STATUSES.map((status) => status.key),
    ['todo', 'in_progress', 'done'],
  );
});

test('rank sorts first, so a later due date can sit above an earlier one', () => {
  const sorted = sortTasksByUrgency([
    task({ id: 'later', due_date: '2026-05-02', rank: 'a9' }),
    task({ id: 'sooner-low', due_date: '2026-05-01', rank: 'a0' }),
    task({ id: 'sooner-mid', due_date: '2026-05-01', rank: 'a5' }),
    task({ id: 'undated-top', due_date: null, rank: 'b00' }),
  ]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['undated-top', 'later', 'sooner-mid', 'sooner-low'],
  );
});

test('a dropped rank keeps the task between its new neighbours', () => {
  const next = rankAfterDrop('a5', 'a1');
  const sorted = sortTasksByUrgency([
    task({ id: 'above', rank: 'a5', due_date: '2026-06-01' }),
    task({ id: 'moved', rank: next, due_date: '2026-01-01' }),
    task({ id: 'below', rank: 'a1', due_date: null }),
  ]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['above', 'moved', 'below'],
  );
});

test('equal ranks fall back to due date, earliest first and undated last', () => {
  const sorted = sortTasksByUrgency([
    task({ id: 'undated', due_date: null, rank: 'a2' }),
    task({ id: 'later', due_date: '2026-05-02', rank: 'a2' }),
    task({ id: 'sooner', due_date: '2026-05-01', rank: 'a2' }),
  ]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['sooner', 'later', 'undated'],
  );
});

test('equal due date and rank keep position, then creation time, then id', () => {
  const sorted = sortTasksByUrgency([
    task({ id: 'b', rank: 'a0', position: 2, created_at: '2026-01-01T00:00:00.000Z' }),
    task({ id: 'a', rank: 'a0', position: 1, created_at: '2026-02-01T00:00:00.000Z' }),
    task({ id: 'c', rank: 'a0', position: 2, created_at: '2026-01-01T00:00:00.000Z' }),
  ]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['a', 'b', 'c'],
  );
});

test('in progress is its own column and stays in the open list order', () => {
  const tasks = [
    task({ id: 'later', status: 'todo', rank: 'a0' }),
    task({ id: 'doing', status: 'in_progress', rank: 'a9' }),
    task({ id: 'old', status: 'backlog' as never, rank: 'a5' }),
    task({ id: 'finished', status: 'done', rank: 'b0' }),
  ];
  const groups = groupByStatus(tasks);
  assert.deepEqual(
    groups.todo.map((item) => item.id),
    ['old', 'later'],
  );
  assert.deepEqual(
    groups.in_progress.map((item) => item.id),
    ['doing'],
  );
  assert.deepEqual(
    groups.done.map((item) => item.id),
    ['finished'],
  );

  const openList = sortTasksByUrgency(tasks.filter((item) => listBucket(item.status) === 'todo'));
  assert.deepEqual(
    openList.map((item) => item.id),
    ['doing', 'old', 'later'],
  );
});
