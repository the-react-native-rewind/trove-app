import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  inboxActionTitle,
  insertInboxItem,
  normalizeInboxText,
  replaceInboxItemId,
  sourceLabel,
  withoutInboxItem,
  type InboxItem,
} from './inbox';

function item(id: string, overrides: Partial<InboxItem> = {}): InboxItem {
  return { id, text: id, source: null, createdAt: `2026-01-01T00:00:0${id}Z`, ...overrides };
}

test('normalizeInboxText collapses whitespace and trims', () => {
  assert.equal(normalizeInboxText('  clean   the\n boiler  '), 'clean the boiler');
  assert.equal(normalizeInboxText(''), '');
});

test('sourceLabel hides the plain app capture and keeps tool names', () => {
  assert.equal(sourceLabel(null), null);
  assert.equal(sourceLabel('app'), null);
  assert.equal(sourceLabel('APP'), null);
  assert.equal(sourceLabel('  '), null);
  assert.equal(sourceLabel('Grok'), 'Grok');
});

test('inboxActionTitle takes the first line, normalized and capped', () => {
  assert.equal(inboxActionTitle('clean the boiler\nring the plumber'), 'clean the boiler');
  assert.equal(inboxActionTitle('a'.repeat(400)).length, 300);
});

test('insertInboxItem prepends newest first and dedupes by id', () => {
  const list = [item('1')];
  const next = insertInboxItem(list, item('2'));
  assert.deepEqual(
    next.map((i) => i.id),
    ['2', '1'],
  );
  assert.equal(insertInboxItem(next, item('2')), next);
});

test('withoutInboxItem removes by id and is a no-op when absent', () => {
  const list = [item('1'), item('2')];
  assert.deepEqual(
    withoutInboxItem(list, '1').map((i) => i.id),
    ['2'],
  );
  assert.equal(withoutInboxItem(list, 'x'), list);
});

test('replaceInboxItemId swaps a pending id for the saved one', () => {
  const list = [item('pending:1')];
  assert.deepEqual(
    replaceInboxItemId(list, 'pending:1', 'real').map((i) => i.id),
    ['real'],
  );
  assert.equal(replaceInboxItemId(list, 'missing', 'real'), list);
});
