import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRouteMix } from '../../src/domain/routeMix.js';
import { route } from '../fixtures.js';

const routes = [
  route({ dest: 'SEA', distanceMiles: 1448, passengerDepartures: 900, seats: 150_000 }),
  route({
    dest: 'ICN',
    destCountry: 'KR',
    distanceMiles: 3794,
    passengerDepartures: 100,
    seats: 30_000,
    cargoDepartures: 600,
  }),
  route({ dest: 'SDF', distanceMiles: 3122, cargoDepartures: 400 }),
];

test('splits long-haul share by passenger, cargo and all departures', () => {
  const mix = computeRouteMix(routes, 3000);
  assert.equal(mix.passenger.departures, 1000);
  assert.equal(mix.passenger.longHaulSharePct, 10);
  assert.equal(mix.passenger.longHaulSeatSharePct, 16.7);
  assert.equal(mix.cargo.longHaulSharePct, 100);
  assert.equal(mix.all.longHaulSharePct, 55); // 1,100 of 2,000 departures
  assert.equal(mix.internationalPassengerSharePct, 10);
  assert.equal(mix.destinations, 3);
  assert.deepEqual(
    mix.topPassengerLongHaulRoutes.map((r) => r.dest),
    ['ICN'],
  );
  assert.deepEqual(
    mix.topCargoLongHaulRoutes.map((r) => r.dest),
    ['ICN', 'SDF'],
  );
});

test('passenger long-haul routes are not crowded out by busier cargo routes', () => {
  // The Anchorage pattern: freighter routes dominate departures, so a combined top-N list hid
  // the passenger routes and the agent concluded there was only one.
  const cargoHub = [
    ...['HKG', 'PVG', 'ICN', 'TPE', 'NRT', 'SDF', 'MEM', 'ORD', 'LAX', 'CVG', 'IND'].map((dest) =>
      route({ dest, distanceMiles: 3500, cargoDepartures: 2000 }),
    ),
    route({ dest: 'DFW', distanceMiles: 3043, passengerDepartures: 377 }),
    route({ dest: 'ATL', distanceMiles: 3417, passengerDepartures: 132 }),
    route({ dest: 'IAD', distanceMiles: 3356, passengerDepartures: 108 }),
  ];
  const mix = computeRouteMix(cargoHub, 3000);
  assert.deepEqual(
    mix.topPassengerLongHaulRoutes.map((r) => r.dest),
    ['DFW', 'ATL', 'IAD'],
  );
  assert.equal(mix.topCargoLongHaulRoutes.length, 10);
  assert.ok(mix.topCargoLongHaulRoutes.every((r) => r.cargoDepartures > 0));
});

test('threshold is a parameter, not a hard-coded assumption', () => {
  assert.equal(computeRouteMix(routes, 4000).all.longHaulSharePct, 0);
  assert.equal(computeRouteMix(routes, 1000).all.longHaulSharePct, 100);
});

test('returns null shares when there are no departures of a kind', () => {
  const mix = computeRouteMix([route({ dest: 'SEA', passengerDepartures: 10 })], 3000);
  assert.equal(mix.cargo.longHaulSharePct, null);
});
