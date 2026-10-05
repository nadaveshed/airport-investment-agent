import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from '../../src/utils/ttlCache.js';

test('entries expire after the TTL but remain readable as stale', () => {
  let now = 0;
  const cache = new TtlCache<string>(100, 10, () => now);
  cache.set('a', 'x');
  assert.equal(cache.get('a'), 'x');
  now = 150;
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.getStale('a'), 'x');
});

test('evicts the least recently set entry beyond capacity', () => {
  const cache = new TtlCache<number>(1000, 2);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('a', 1); // refresh a
  cache.set('c', 3);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.size, 2);
});
