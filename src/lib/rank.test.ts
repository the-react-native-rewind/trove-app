import assert from 'node:assert/strict';
import { test } from 'node:test';

import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

import {
  compareRank,
  rankAfterDrop,
  rankAfterStepUp,
  rankAtBottom,
  rankAtTop,
  rankForPriority,
  rankKeyByIndex,
  type RankedRef,
} from './rank';

function row(id: string, rank: string, due: string | null = '2026-05-01', space = 'space'): RankedRef {
  return { id, rank, due_date: due, space_id: space };
}

test('rank keys from the library stay in ascending order', () => {
  const keys = generateNKeysBetween(null, null, 200);
  for (let index = 0; index < keys.length; index += 1) {
    assert.equal(rankKeyByIndex(index), keys[index]);
    if (index > 0) assert.ok(keys[index] > keys[index - 1]);
  }
  assert.equal(keys[0], 'a0');
  assert.equal(keys[61], 'az');
  assert.equal(keys[62], 'b00');
});

test('a step up sits between the task above and the one above that', () => {
  const ordered = [row('top', 'a5'), row('mid', 'a3'), row('low', 'a1')];
  const once = rankAfterStepUp('low', ordered);
  assert.equal(once, generateKeyBetween('a3', 'a5'));
  const twice = rankAfterStepUp('low', [row('top', 'a5'), { ...row('low', once!), }, row('mid', 'a3')].sort((a, b) => compareRank(a.rank, b.rank)));
  assert.equal(twice, generateKeyBetween('a5', null));
});

test('two quick steps each move one place and never cross a due date or circle', () => {
  const ordered = [
    row('other-day', 'b00', '2026-05-02'),
    row('other-circle', 'a9', '2026-05-01', 'elsewhere'),
    row('first', 'a4'),
    row('second', 'a2'),
    row('third', 'a0'),
  ];
  const once = rankAfterStepUp('third', ordered);
  if (!once) throw new Error('expected one step up');
  assert.ok(once > 'a2' && once < 'a4');
  const afterOnce = [row('other-day', 'b00', '2026-05-02'), row('other-circle', 'a9', '2026-05-01', 'elsewhere'), row('first', 'a4'), row('third', once), row('second', 'a2')];
  const twice = rankAfterStepUp('third', afterOnce);
  if (!twice) throw new Error('expected a second step up');
  assert.equal(twice, generateKeyBetween('a4', null));
  assert.ok(twice < 'b00');
});

test('the top of a due-date group does not move', () => {
  const ordered = [row('top', 'a5'), row('low', 'a0'), row('later', 'a9', '2026-05-02')];
  assert.equal(rankAfterStepUp('top', ordered), null);
  assert.equal(rankAfterStepUp('missing', ordered), null);
});

test('a drop writes a key between the neighbours, including the ends of the list', () => {
  const between = rankAfterDrop('a5', 'a1');
  assert.equal(between, generateKeyBetween('a1', 'a5'));
  assert.ok(between > 'a1' && between < 'a5');

  const top = rankAfterDrop(null, 'a4');
  const bottom = rankAfterDrop('a0', null);
  assert.equal(top, generateKeyBetween('a4', null));
  assert.equal(bottom, generateKeyBetween(null, 'a0'));
  assert.ok(top > 'a4');
  assert.ok(bottom < 'a0');
  assert.equal(rankAfterDrop(null, null), 'a0');
});

test('a drop on tied neighbours still produces a key above that shared rank', () => {
  const key = rankAfterDrop('a2', 'a2');
  assert.equal(key, generateKeyBetween('a2', null));
  assert.ok(key > 'a2');
});

test('new and low ranks sort below the group, high ranks sort above it', () => {
  const group = ['a2', 'a0', 'a4'];
  const bottom = rankForPriority(null, group);
  const low = rankForPriority('low', group);
  const high = rankForPriority('high', group);
  const medium = rankForPriority('medium', group);
  assert.equal(bottom, rankAtBottom('a0'));
  assert.equal(low, bottom);
  assert.equal(high, rankAtTop('a4'));
  assert.ok(bottom < 'a0');
  assert.ok(high > 'a4');
  assert.ok(medium > 'a0' && medium < 'a4');
  assert.equal(rankForPriority('high', []), 'a0');
});

test('thirty successive inserts between two keys stay ordered', () => {
  let lower: string | null = 'a0';
  const upper = 'a1';
  let previous = lower;
  for (let step = 0; step < 30; step += 1) {
    const next = generateKeyBetween(lower, upper);
    assert.ok(next > previous);
    assert.ok(next < upper);
    previous = next;
    lower = next;
  }
});

test('a spawned-style bottom rank stays last even after later taps', () => {
  const first = rankAtBottom(null);
  const above = rankAtTop(first);
  const spawned = rankAtBottom(first);
  assert.equal(first, 'a0');
  assert.ok(compareRank(above, first) < 0);
  assert.ok(compareRank(spawned, first) > 0);
});
