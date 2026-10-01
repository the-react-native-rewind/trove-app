import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatDueDate, isOverdue, toDateString } from './format';

test('date helpers', () => {
  assert.equal(formatDueDate(null), null);
  assert.equal(toDateString(new Date(2026, 4, 3)), '2026-05-03');
  assert.equal(isOverdue('2000-01-01'), true);
  assert.equal(isOverdue(null), false);
});
