import type { AirportKpis } from '../src/domain/kpis.js';
import type { Airport, RouteSegment } from '../src/types/airport.js';

export function kpis(overrides: Partial<AirportKpis> & { code: string }): AirportKpis {
  return {
    name: `${overrides.code} Airport`,
    state: 'MA',
    hubSize: 'medium',
    enplanements: 1_000_000,
    passengerDeparturesPerDay: 50,
    loadFactor: 0.8,
    passengerCagr: 0.05,
    recoveryVs2019: 1,
    delayRate: 0.2,
    nasDelayRate: 0.05,
    avgNasDelayMinutes: 2,
    cancellationRate: 0.01,
    avgFare: 300,
    fareIndex: 1,
    ...overrides,
  };
}

export function airport(overrides: Partial<Airport> & { code: string }): Airport {
  return {
    name: `${overrides.code} Airport`,
    city: 'City',
    state: 'MA',
    lat: 0,
    lon: 0,
    hubSize: 'medium',
    traffic: [
      {
        year: 2019,
        passengers: 900_000,
        seats: 1_100_000,
        passengerDepartures: 9_000,
        freightLbs: 0,
      },
      {
        year: 2023,
        passengers: 1_000_000,
        seats: 1_250_000,
        passengerDepartures: 10_000,
        freightLbs: 0,
      },
      {
        year: 2024,
        passengers: 1_050_000,
        seats: 1_300_000,
        passengerDepartures: 10_500,
        freightLbs: 0,
      },
      {
        year: 2025,
        passengers: 1_210_000,
        seats: 1_500_000,
        passengerDepartures: 11_000,
        freightLbs: 0,
      },
    ],
    delays: {
      periodStart: '2025-08',
      periodEnd: '2026-07',
      arrivals: 10_000,
      delayed15: 2_000,
      nasDelayed: 500,
      nasDelayMinutes: 20_000,
      cancelled: 100,
    },
    fares: { period: '2025Q2–2026Q1', avgFare: 320, fareIndex: 1.1, marketPassengersPerDay: 3000 },
    ...overrides,
  };
}

export function route(overrides: Partial<RouteSegment> & { dest: string }): RouteSegment {
  return {
    origin: 'ANC',
    destName: overrides.dest,
    destCountry: 'US',
    distanceMiles: 1000,
    passengerDepartures: 0,
    cargoDepartures: 0,
    seats: 0,
    passengers: 0,
    freightLbs: 0,
    ...overrides,
  };
}
