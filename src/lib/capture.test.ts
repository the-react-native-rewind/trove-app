import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fallbackTitle, inferDueDate } from './capture';

test('fallback title keeps the opening words and capitalises them', () => {
  assert.equal(fallbackTitle('  water the greenhouse before friday.  '), 'Water the greenhouse before friday');
});

test('due date inference uses the last date in the sentence', () => {
  const inferred = inferDueDate('order seed potatoes by 12 May 2026', new Date('2026-04-01T12:00:00'));
  assert.equal(inferred?.date, '2026-05-12');
});
