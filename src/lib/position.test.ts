import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { positionBetween } from './position';

describe('positionBetween', () => {
  test('starts a column at the current timestamp', () => {
    const before = Date.now();
    const value = positionBetween(null, null);
    assert.ok(value >= before);
  });

  test('inserts before, after, and between', () => {
    assert.equal(positionBetween(null, 10), 9);
    assert.equal(positionBetween(10, null), 11);
    assert.equal(positionBetween(1, 3), 2);
  });
});
