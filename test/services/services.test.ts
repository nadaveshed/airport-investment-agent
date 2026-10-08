import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS } from '../../src/config/regions.js';
import { JsonSnapshotRepository } from '../../src/repositories/jsonSnapshot.repository.js';
import {
  rankAirportsSchema,
  routeMixSchema,
  routeSchema,
} from '../../src/schemas/airport.schema.js';
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

test('LAX congestion: NAS delay, not load factor, is the largest contributor', () => {
  // The model once called load factor the biggest driver; contributionOrder now states it.
  const lax = scoring
    .compare({ codes: ['LAX', 'SNA'], index: 'congestion' })
    .results.find((r) => r.code === 'LAX')!;
  assert.equal(lax.contributionOrder[0]!.kpi, 'nasDelayRate');
  const nas = lax.contributionOrder[0]!.contribution;
  const load = lax.contributionOrder.find((c) => c.kpi === 'loadFactor')!.contribution;
  assert.ok(nas > load);
});

test('ANC passenger long-haul routes include more than DFW', () => {
  const mix = routeMix.get(routeMixSchema.parse({ code: 'ANC' })).mix;
  const passenger = mix.topPassengerLongHaulRoutes.map((r) => r.dest);
  for (const dest of ['DFW', 'ATL', 'IAH', 'IAD']) assert.ok(passenger.includes(dest), dest);
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

test('single-airport and pair rankings keep their selection position separate from national rank', () => {
  const single = scoring.rank(rankAirportsSchema.parse({ codes: ['SFO'], index: 'unmetDemand' }));
  const sfo = single.results[0]!;
  assert.equal(sfo.selectionRank, 1);
  assert.equal(sfo.selectionSize, 1);
  assert.equal(sfo.nationalRank, 16);
  assert.equal(sfo.nationalSize, repo.all().length);
  const pair = scoring.compare({ codes: ['LAX', 'SFO'], index: 'unmetDemand' });
  assert.equal(pair.results[0]!.code, 'SFO');
  assert.equal(pair.results[0]!.selectionSize, 2);
  assert.equal(pair.results[0]!.nationalRank, sfo.nationalRank);
  assert.equal(pair.results[0]!.score, sfo.score);
});

test('unknown airport codes produce a helpful not-found error', () => {
  assert.throws(
    () => scoring.compare({ codes: ['LAX', 'ZZZ'], index: 'congestion' }),
    NotFoundError,
  );
});

test('a route from a foreign airport is answered with the US-departure direction and a note', () => {
  const result = routeMix.route(routeSchema.parse({ from: 'tlv', to: 'jfk' }));
  const [inbound, outbound] = result.directions;
  assert.ok(inbound && 'status' in inbound);
  assert.match(inbound.status, /not a tracked US airport/);
  assert.ok(outbound && 'passengers' in outbound);
  assert.equal(outbound.origin, 'JFK');
  assert.ok(Number(outbound.passengers.replaceAll(',', '')) > 100_000);
  assert.ok(result.notes.some((n) => /proxy/.test(n)));
  assert.ok(result.usGatewaysToForeignAirport!.some((g) => g.origin === 'EWR'));
});

test('a route needs at least one tracked US airport', () => {
  assert.throws(() => routeMix.route({ from: 'TLV', to: 'LHR' }), NotFoundError);
});
