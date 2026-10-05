import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeKpis } from '../../src/domain/kpis.js';
import { classifyHub } from '../../src/domain/hubSize.js';
import { airport } from '../fixtures.js';

test('computeKpis derives ratios from the latest year and a two-year growth window', () => {
  const k = computeKpis(airport({ code: 'BDL' }));
  assert.equal(k.enplanements, 1_210_000);
  assert.ok(Math.abs(k.loadFactor! - 1_210_000 / 1_500_000) < 1e-12);
  assert.ok(Math.abs(k.passengerCagr! - 0.1) < 1e-12); // 1.0M (2023) → 1.21M (2025)
  assert.ok(Math.abs(k.recoveryVs2019! - 1_210_000 / 900_000) < 1e-12);
  assert.equal(k.delayRate, 0.2);
  assert.equal(k.nasDelayRate, 0.05);
  assert.equal(k.avgNasDelayMinutes, 2);
  assert.equal(k.fareIndex, 1.1);
});

test('computeKpis returns null for sources that do not cover the airport', () => {
  const k = computeKpis(airport({ code: 'ANC', delays: undefined, fares: undefined }));
  assert.equal(k.nasDelayRate, null);
  assert.equal(k.fareIndex, null);
  assert.equal(k.avgFare, null);
});

test('computeKpis returns null growth when the base year is missing', () => {
  const a = airport({ code: 'NEW' });
  const k = computeKpis({ ...a, traffic: a.traffic.slice(-1) });
  assert.equal(k.passengerCagr, null);
  assert.equal(k.recoveryVs2019, null);
});

test('classifyHub follows FAA enplanement-share thresholds', () => {
  assert.equal(classifyHub(0.02), 'large');
  assert.equal(classifyHub(0.01), 'large');
  assert.equal(classifyHub(0.005), 'medium');
  assert.equal(classifyHub(0.001), 'small');
  assert.equal(classifyHub(0.0001), 'nonhub');
});
