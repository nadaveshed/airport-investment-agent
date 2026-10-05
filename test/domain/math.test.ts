import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cagr, percentileRank, ratio } from '../../src/utils/math.js';

test('percentileRank uses mid-rank so ties share a percentile', () => {
  assert.equal(percentileRank(3, [1, 2, 3, 4]), 62.5);
  assert.equal(percentileRank(2, [2, 2, 2, 2]), 50);
  assert.equal(percentileRank(10, [1, 2, 3]), 100);
  assert.equal(percentileRank(0, [1, 2, 3]), 0);
});

test('percentileRank is order independent', () => {
  assert.equal(percentileRank(5, [9, 1, 5, 3]), percentileRank(5, [1, 3, 5, 9]));
});

test('cagr computes compound growth and rejects undefined inputs', () => {
  assert.ok(Math.abs(cagr(100, 121, 2)! - 0.1) < 1e-12);
  assert.equal(cagr(0, 100, 2), null);
  assert.equal(cagr(100, 120, 0), null);
});

test('ratio returns null for missing or zero denominators', () => {
  assert.equal(ratio(1, 0), null);
  assert.equal(ratio(undefined, 4), null);
  assert.equal(ratio(1, 4), 0.25);
});
