import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatWeekRange, getWeekStart, shiftWeek } from './week';

test('week start is the Monday of that local week', () => {
  assert.equal(getWeekStart(new Date(2026, 3, 1)), '2026-03-30');
});

test('shift and range stay on calendar weeks', () => {
  assert.equal(shiftWeek('2026-03-30', 1), '2026-04-06');
  assert.equal(formatWeekRange('2026-03-30'), '30 Mar–5 Apr 2026');
});
