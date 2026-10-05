import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INDEX_DEFINITIONS, type IndexDefinition } from '../../src/config/scoring.config.js';
import { rankAirports, scoreAirport } from '../../src/domain/scoring.js';
import { kpis } from '../fixtures.js';

const universe = Array.from({ length: 20 }, (_, i) =>
  kpis({
    code: `A${String(i).padStart(2, '0')}`,
    loadFactor: 0.6 + i * 0.01,
    passengerCagr: i * 0.005,
  }),
);

const twoKpiIndex: IndexDefinition = {
  label: 'Test',
  description: 'Test index',
  cohort: 'all',
  weights: { loadFactor: 0.5, passengerCagr: 0.5 },
};

test('every index definition has weights summing to 1', () => {
  for (const [name, def] of Object.entries(INDEX_DEFINITIONS)) {
    const total = Object.values(def.weights).reduce((s, w) => s + w, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `${name} weights sum to ${total}`);
  }
});

test('score is the weighted sum of cohort percentiles', () => {
  const top = universe.at(-1)!;
  const result = scoreAirport(top, universe, twoKpiIndex);
  assert.equal(result.score, 97.5); // highest of 20 on both KPIs → percentile 97.5
  assert.equal(result.confidence, 'high');
  assert.deepEqual(result.caveats, []);
  const sum = result.components.reduce((s, c) => s + c.contribution, 0);
  assert.ok(Math.abs(sum - result.score) < 0.1);
});

test('missing KPIs redistribute weight and lower confidence', () => {
  const target = { ...universe[19]!, passengerCagr: null };
  const result = scoreAirport(target, universe, twoKpiIndex);
  const growth = result.components.find((c) => c.kpi === 'passengerCagr')!;
  const lf = result.components.find((c) => c.kpi === 'loadFactor')!;
  assert.equal(growth.percentile, null);
  assert.equal(growth.contribution, 0);
  assert.equal(lf.appliedWeight, 1);
  assert.equal(result.score, 97.5);
  assert.equal(result.confidence, 'low'); // 50% of weight missing
  assert.match(result.caveats[0]!, /redistributed/);
});

test('hubSize cohort compares airports only with peers of the same class', () => {
  const mixed = [
    ...universe,
    ...Array.from({ length: 10 }, (_, i) =>
      kpis({ code: `L${i}`, hubSize: 'large', loadFactor: 0.9 + i * 0.001 }),
    ),
  ];
  const result = scoreAirport(universe[19]!, mixed, { ...twoKpiIndex, cohort: 'hubSize' });
  assert.equal(result.cohort, 'medium hubs');
  assert.equal(result.cohortSize, 20);
  assert.equal(result.components.find((c) => c.kpi === 'loadFactor')!.percentile, 97.5);
});

test('small cohorts are flagged as low confidence', () => {
  const tiny = universe.slice(0, 5);
  const result = scoreAirport(tiny[0]!, tiny, twoKpiIndex);
  assert.equal(result.confidence, 'low');
  assert.ok(result.caveats.some((c) => c.includes('Small peer group')));
});

test('ranking is deterministic and breaks ties by code', () => {
  const twins = [kpis({ code: 'ZZZ' }), kpis({ code: 'AAA' })];
  const first = rankAirports(twins, universe, twoKpiIndex);
  const second = rankAirports([...twins].reverse(), universe, twoKpiIndex);
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((r) => [r.code, r.rank]),
    [
      ['AAA', 1],
      ['ZZZ', 2],
    ],
  );
});
