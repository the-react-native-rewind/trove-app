import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DUE_SOON_DAYS,
  dueBand,
  groupByStatus,
  isDuePressing,
  listBucket,
  nextTaskStatus,
  normalizeStatus,
  sortTasksByRank,
  sortTasksByUrgency,
} from './board';
import { rankAfterDrop } from './rank';
import { STATUSES, type TaskWithRefs } from './types';

// Fixed so the fixtures below sit a comfortable distance from 'now'.
const NOW = new Date('2026-04-01T09:00:00');

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
  assert.equal(nextTaskStatus('todo'), 'in_progress');
  assert.equal(nextTaskStatus('in_progress'), 'done');
  assert.equal(nextTaskStatus('done'), 'todo');
  assert.equal(nextTaskStatus('mystery'), 'in_progress');
  assert.deepEqual(
    STATUSES.map((status) => status.key),
    ['todo', 'in_progress', 'done'],
  );
});

test('a date far out does not climb over the order you chose', () => {
  const sorted = sortTasksByUrgency([
    task({ id: 'later', due_date: '2026-05-02', rank: 'a9' }),
    task({ id: 'sooner-low', due_date: '2026-05-01', rank: 'a0' }),
    task({ id: 'sooner-mid', due_date: '2026-05-01', rank: 'a5' }),
    task({ id: 'undated-top', due_date: null, rank: 'b00' }),
  ], NOW);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['undated-top', 'later', 'sooner-mid', 'sooner-low'],
  );
});

test('a dropped rank keeps the task between its new neighbours', () => {
  const next = rankAfterDrop('a5', 'a1');
  const sorted = sortTasksByUrgency([
    task({ id: 'above', rank: 'a5', due_date: '2026-06-01' }),
    task({ id: 'moved', rank: next, due_date: '2026-07-01' }),
    task({ id: 'below', rank: 'a1', due_date: null }),
  ], NOW);
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
  ], NOW);
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
  ], NOW);
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

  const openList = sortTasksByUrgency(
    tasks.filter((item) => listBucket(item.status) === 'todo'),
    NOW,
  );
  assert.deepEqual(
    openList.map((item) => item.id),
    ['doing', 'old', 'later'],
  );
});

function dated(id: string, due: string | null, rank: string, status = 'todo'): TaskWithRefs {
  return task({ id, due_date: due, rank, status });
}

test('a due date lands in the band that says how hard it is pressing', () => {
  assert.equal(dueBand(dated('a', '2026-03-31', 'a0'), NOW), 'overdue');
  assert.equal(dueBand(dated('a', '2026-04-01', 'a0'), NOW), 'today');
  assert.equal(dueBand(dated('a', '2026-04-04', 'a0'), NOW), 'soon');
  // One day past the window is no longer a reason to jump the queue.
  assert.equal(dueBand(dated('a', '2026-04-05', 'a0'), NOW), 'later');
  assert.equal(dueBand(dated('a', null, 'a0'), NOW), 'none');
  // Finished work never presses, however late it was.
  assert.equal(dueBand(dated('a', '2026-01-01', 'a0', 'done'), NOW), 'none');
  assert.equal(DUE_SOON_DAYS, 3);
  assert.equal(isDuePressing('soon'), true);
  assert.equal(isDuePressing('later'), false);
  assert.equal(isDuePressing('none'), false);
});

test('what is bearing down leads the list, soonest first, whatever its rank', () => {
  const sorted = sortTasksByUrgency(
    [
      dated('ranked-top', null, 'z9'),
      dated('due-in-three', '2026-04-04', 'a0'),
      dated('overdue', '2026-03-28', 'a0'),
      dated('due-today', '2026-04-01', 'a0'),
      dated('far-off', '2026-09-01', 'b0'),
    ],
    NOW,
  );
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['overdue', 'due-today', 'due-in-three', 'ranked-top', 'far-off'],
  );
});

test('a finished action does not get dragged to the top by its old due date', () => {
  const sorted = sortTasksByUrgency(
    [dated('done-late', '2026-03-01', 'a0', 'done'), dated('open-soon', '2026-04-02', 'a0')],
    NOW,
  );
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['open-soon', 'done-late'],
  );
});

test('rank order is still available on its own, for reordering by hand', () => {
  const byRank = sortTasksByRank([
    dated('low', '2026-03-01', 'a0'),
    dated('high', null, 'z9'),
    dated('mid', '2026-04-02', 'a5'),
  ]);
  assert.deepEqual(
    byRank.map((item) => item.id),
    ['high', 'mid', 'low'],
  );
});
