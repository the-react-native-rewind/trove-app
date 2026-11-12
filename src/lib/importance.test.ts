import assert from 'node:assert/strict';
import { test } from 'node:test';

import { importanceLabel, ranksForPlacement } from './importance';
import { compareRank, rankForImportance } from './rank';

test('placement ranks skip done work and, when asked, other projects', () => {
  const tasks = [
    { status: 'todo', project_id: 'p1', rank: 'a4' },
    { status: 'in_progress', project_id: 'p1', rank: 'a2' },
    { status: 'done', project_id: 'p1', rank: 'a9' },
    { status: 'todo', project_id: 'p2', rank: 'a0' },
    { status: 'todo', project_id: null, rank: 'a1' },
  ];
  assert.deepEqual(ranksForPlacement(tasks, null), ['a4', 'a2', 'a0', 'a1']);
  assert.deepEqual(ranksForPlacement(tasks, 'p1'), ['a4', 'a2']);
});

test('the slider label names the ends and the gap in between', () => {
  const peers = ['a0', 'a1', 'a2', 'a3'];
  assert.equal(importanceLabel(0, peers), 'Least important action');
  assert.equal(importanceLabel(1, peers), 'Most important action');
  assert.equal(importanceLabel(0.5, peers), 'Middle of the list');
  assert.equal(importanceLabel(0.5, []), 'First action in the list');
});

test('importance places a new rank in the matching slot of the visible list', () => {
  const peers = ['a0', 'a3', 'a1', 'a2'];
  const cases: { importance: number; index: number }[] = [
    { importance: 0, index: 4 },
    { importance: 0.1, index: 4 },
    { importance: 0.5, index: 2 },
    { importance: 1, index: 0 },
    { importance: 2, index: 0 },
    { importance: Number.NaN, index: 4 },
  ];
  for (const { importance, index } of cases) {
    const rank = rankForImportance(peers, importance);
    const ordered = [...peers, rank].sort(compareRank);
    assert.equal(ordered.indexOf(rank), index, `importance ${importance}`);
    assert.equal(importanceLabel(importance, peers) !== '', true);
  }
  const middle = rankForImportance(peers, 0.5);
  assert.ok(middle > 'a1' && middle < 'a2');
});

test('an empty list and tied ranks still produce one ordered key', () => {
  assert.equal(rankForImportance([], 0), 'a0');
  assert.equal(rankForImportance(['', 'a0'], 1), rankForImportance(['a0'], 1));
  const aboveTie = rankForImportance(['a2', 'a2', 'a0'], 1);
  const belowTie = rankForImportance(['a2', 'a2', 'a0'], 0);
  assert.ok(compareRank(aboveTie, 'a2') < 0);
  assert.ok(compareRank(belowTie, 'a0') > 0);
});
