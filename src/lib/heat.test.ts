import assert from 'node:assert/strict';
import { test } from 'node:test';

import { heatColor, importanceColor } from '../theme/tokens';

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

test('importance colour cools at the bottom of the slider and heats at the top', () => {
  assert.equal(importanceColor(0).toLowerCase(), '#c9bca4');
  assert.equal(importanceColor(1).toLowerCase(), heatColor(0, 2).toLowerCase());
  assert.equal(importanceColor(Number.NaN).toLowerCase(), importanceColor(0).toLowerCase());
  assert.ok(importanceColor(0.5).toLowerCase() !== importanceColor(0).toLowerCase());
});
