import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cleanGoalValue,
  formatGoalAmount,
  goalDraftProblem,
  goalProgress,
  goalResultLabel,
  normalizeGoalText,
  parseGoalValue,
  patchGoal,
  sortGoals,
  withoutGoal,
  type Goal,
} from './goals';

function goal(id: string, patch: Partial<Goal> = {}): Goal {
  return {
    id,
    title: id,
    description: null,
    resultKind: 'outcome',
    outcome: 'It is done',
    targetValue: null,
    currentValue: 0,
    unit: null,
    numberFormat: 'plain',
    achievedAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    projects: [],
    ...patch,
  };
}

test('goal text is collapsed and trimmed', () => {
  assert.equal(normalizeGoalText('  Ship   the   thing '), 'Ship the thing');
  assert.equal(normalizeGoalText('   '), '');
});

test('a value field only accepts a usable number', () => {
  assert.equal(parseGoalValue('100'), 100);
  assert.equal(parseGoalValue('1,250'), 1250);
  assert.equal(parseGoalValue('12.345'), 12.35);
  assert.equal(parseGoalValue(''), null);
  assert.equal(parseGoalValue('soon'), null);
  assert.equal(parseGoalValue('-4'), null);
  assert.equal(cleanGoalValue(Number.NaN), 0);
  assert.equal(cleanGoalValue(-2), 0);
});

test('a written goal has no middle, a counted one does', () => {
  assert.equal(goalProgress(goal('a')), 0);
  assert.equal(goalProgress(goal('a', { achievedAt: '2026-11-02T00:00:00.000Z' })), 1);
  const counted = goal('b', { resultKind: 'number', outcome: null, targetValue: 100, currentValue: 25 });
  assert.equal(goalProgress(counted), 0.25);
  // Going past the target reads as done, not as an overflowing bar.
  assert.equal(goalProgress({ ...counted, currentValue: 140 }), 1);
  // A target of zero would divide by nothing.
  assert.equal(goalProgress({ ...counted, targetValue: 0 }), 0);
});

test('the result line says where a goal stands', () => {
  assert.equal(goalResultLabel(goal('a')), 'It is done');
  assert.equal(
    goalResultLabel(
      goal('b', {
        resultKind: 'number',
        outcome: null,
        targetValue: 100,
        currentValue: 12,
        unit: 'paying users',
      }),
    ),
    '12 of 100 paying users',
  );
  assert.equal(
    goalResultLabel(goal('c', { resultKind: 'number', outcome: null, targetValue: 5, currentValue: 2.5 })),
    '2.5 of 5',
  );
});

test('a draft is held back until it names a result', () => {
  const base = { title: 'Grow Trove', resultKind: 'outcome' as const, outcome: '', targetValue: '' };
  assert.equal(goalDraftProblem({ ...base, title: '  ' }), 'Give the goal a name.');
  assert.equal(goalDraftProblem(base), 'Write what will be true when you have got there.');
  assert.equal(goalDraftProblem({ ...base, outcome: '100 paying users' }), null);
  const counted = { ...base, resultKind: 'number' as const };
  assert.equal(goalDraftProblem(counted), 'Set the number you are aiming for.');
  assert.equal(goalDraftProblem({ ...counted, targetValue: '0' }), 'Aim for something above zero.');
  assert.equal(goalDraftProblem({ ...counted, targetValue: '100' }), null);
});

test('reached goals gather at the bottom, newest first above them', () => {
  const goals = [
    goal('old', { createdAt: '2026-11-01T00:00:00.000Z' }),
    goal('done', { createdAt: '2026-11-05T00:00:00.000Z', achievedAt: '2026-11-06T00:00:00.000Z' }),
    goal('new', { createdAt: '2026-11-04T00:00:00.000Z' }),
  ];
  assert.deepEqual(
    sortGoals(goals).map((item) => item.id),
    ['new', 'old', 'done'],
  );
});

test('the list helpers keep the array when nothing changed', () => {
  const goals = [goal('a'), goal('b')];
  assert.equal(withoutGoal(goals, 'missing'), goals);
  assert.equal(patchGoal(goals, 'missing', { title: 'x' }), goals);
  assert.deepEqual(
    withoutGoal(goals, 'a').map((item) => item.id),
    ['b'],
  );
  assert.equal(patchGoal(goals, 'b', { title: 'Renamed' })[1]?.title, 'Renamed');
});

test('a counted goal reads the way its format asks', () => {
  const counted = (format: 'plain' | 'currency' | 'percent', unit: string | null) =>
    goal('g', {
      resultKind: 'number',
      outcome: null,
      targetValue: 10000,
      currentValue: 4000,
      unit,
      numberFormat: format,
    });
  assert.equal(goalResultLabel(counted('plain', 'paying users')), '4,000 of 10,000 paying users');
  assert.equal(goalResultLabel(counted('currency', '£')), '£4,000 of £10,000');
  assert.equal(goalResultLabel(counted('percent', null)), '4,000% of 10,000%');
  // No unit is fine; the figures still group.
  assert.equal(goalResultLabel(counted('plain', null)), '4,000 of 10,000');
});

test('figures group in thousands and keep any part of a number', () => {
  assert.equal(formatGoalAmount(999, 'plain', null), '999');
  assert.equal(formatGoalAmount(1000, 'plain', null), '1,000');
  assert.equal(formatGoalAmount(1234567, 'plain', null), '1,234,567');
  assert.equal(formatGoalAmount(1234.5, 'plain', null), '1,234.5');
  assert.equal(formatGoalAmount(12.75, 'currency', '$'), '$12.75');
  assert.equal(formatGoalAmount(40, 'percent', 'ignored'), '40%');
  // A symbol with stray spacing still sits flush against the figure.
  assert.equal(formatGoalAmount(5, 'currency', ' € '), '€5');
});
