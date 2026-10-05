import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS } from '../../src/config/regions.js';
import { JsonSnapshotRepository } from '../../src/repositories/jsonSnapshot.repository.js';
import { rankAirportsSchema, routeMixSchema } from '../../src/schemas/airport.schema.js';
import { AirportService } from '../../src/services/airport.service.js';
import { RouteMixService } from '../../src/services/routeMix.service.js';
import { ScoringService } from '../../src/services/scoring.service.js';
import { NotFoundError, ValidationError } from '../../src/utils/errors.js';

// Runs against the committed snapshot: the four questions from the brief must be answerable from tool output.
const repo = JsonSnapshotRepository.fromFiles('data/snapshot.json', 'data/airportConstraints.json');
const airports = new AirportService(repo);
const scoring = new ScoringService(airports, repo);
const routeMix = new RouteMixService(airports, repo);

test('Q1: New England expansion ranking stays in-region, excludes non-hubs and is sorted', () => {
  const result = scoring.rank(rankAirportsSchema.parse({ region: 'new england' }));
  const states = new Set(REGIONS['new england']);
  assert.ok(result.results.length > 0);
  assert.ok(result.results.every((r) => states.has(r.state) && r.hubSize !== 'nonhub'));
  assert.ok(result.excludedNonHubs > 0);
  const scores = result.results.map((r) => r.score);
  assert.deepEqual(
    scores,
    [...scores].sort((a, b) => b - a),
  );
  assert.ok(result.results.some((r) => r.code === 'BOS'));
});

test('Q2: LAX vs SNA congestion returns both airports and SNA regulatory context', () => {
  const result = scoring.compare({ codes: ['LAX', 'SNA'], index: 'congestion' });
  assert.deepEqual(result.results.map((r) => r.code).sort(), ['LAX', 'SNA']);
  const sna = result.results.find((r) => r.code === 'SNA')!;
  assert.ok(sna.knownConstraints.some((c) => /passenger cap/i.test(c)));
  assert.ok(sna.components.every((c) => typeof c.display === 'string'));
});

test('Q3: Anchorage long-haul share separates passenger and cargo flights', () => {
  const result = routeMix.get(routeMixSchema.parse({ code: 'anc' }));
  assert.equal(result.mix.longHaulMiles, 3000);
  assert.ok(result.mix.cargo.longHaulSharePct! > result.mix.passenger.longHaulSharePct!);
  assert.ok(result.notes.some((n) => /cargo/i.test(n)));
});

test('Q4: SFO unmet demand is high and explained by a curated constraint', () => {
  const ranked = scoring.rank(rankAirportsSchema.parse({ codes: ['SFO'], index: 'unmetDemand' }));
  assert.ok(ranked.results[0]!.score > 70);
  const profile = airports.profile('SFO');
  assert.ok(profile.knownConstraints.some((c) => /runway/i.test(c.constraint)));
});

test('weight overrides are re-normalized and unknown KPIs are rejected', () => {
  const custom = scoring.rank(
    rankAirportsSchema.parse({ region: 'new england', weights: { passengerCagr: 1 } }),
  );
  assert.equal(custom.index.customWeights, true);
  assert.throws(
    () => scoring.rank(rankAirportsSchema.parse({ weights: { avgFare: 0.5 } })),
    ValidationError,
  );
});

test('unknown airport codes produce a helpful not-found error', () => {
  assert.throws(
    () => scoring.compare({ codes: ['LAX', 'ZZZ'], index: 'congestion' }),
    NotFoundError,
  );
});
