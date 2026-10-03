import assert from 'node:assert/strict';
import { test } from 'node:test';

import { heatColor } from '../theme/tokens';

test('heat stays hottest across the top fifth and cools to neutral at the bottom', () => {
  const total = 10;
  const top = heatColor(0, total);
  assert.equal(heatColor(1, total), top);
  assert.ok(heatColor(2, total) !== top);
  const bottom = heatColor(total - 1, total);
  assert.equal(bottom.toLowerCase(), '#c9bca4');
  assert.ok(heatColor(5, total).toLowerCase() !== top.toLowerCase());
  assert.ok(heatColor(5, total).toLowerCase() !== bottom.toLowerCase());
  assert.equal(heatColor(0, 1), top);
});
