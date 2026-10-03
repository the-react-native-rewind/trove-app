import assert from 'node:assert/strict';
import { test } from 'node:test';

import { headerHiddenAfterScroll } from './headerScroll';

const base = { hidden: false, headerHeight: 120 };

test('a downward flick hides the header once the list has moved', () => {
  assert.equal(headerHiddenAfterScroll({ ...base, y: 40, previousY: 10 }), true);
});

test('an upward flick brings a hidden header back', () => {
  assert.equal(
    headerHiddenAfterScroll({ ...base, hidden: true, y: 80, previousY: 100 }),
    false,
  );
});

test('the header stays visible at the top and ignores tiny movement', () => {
  assert.equal(headerHiddenAfterScroll({ ...base, y: 0, previousY: 12 }), null);
  assert.equal(headerHiddenAfterScroll({ ...base, hidden: true, y: 2, previousY: 30 }), false);
  assert.equal(headerHiddenAfterScroll({ ...base, y: 30, previousY: 26 }), null);
  assert.equal(headerHiddenAfterScroll({ ...base, y: 10, previousY: 0 }), null);
});

test('a header with no height does not animate', () => {
  assert.equal(
    headerHiddenAfterScroll({ y: 40, previousY: 0, hidden: false, headerHeight: 0 }),
    null,
  );
});
