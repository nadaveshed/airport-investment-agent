import type { RouteSegment } from '../types/airport.js';
import { round } from '../utils/math.js';

export interface DepartureShare {
  departures: number;
  longHaulDepartures: number;
  /** Percentage (0–100); null when there are no departures of this kind. */
  longHaulSharePct: number | null;
}

export interface RouteMix {
  longHaulMiles: number;
  passenger: DepartureShare & { seats: number; longHaulSeatSharePct: number | null };
  cargo: DepartureShare;
  all: DepartureShare;
  internationalPassengerSharePct: number | null;
  destinations: number;
  topLongHaulRoutes: {
    dest: string;
    destName: string;
    destCountry: string;
    distanceMiles: number;
    passengerDepartures: number;
    cargoDepartures: number;
  }[];
}

const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : null);

const share = (departures: number, longHaulDepartures: number): DepartureShare => ({
  departures: Math.round(departures),
  longHaulDepartures: Math.round(longHaulDepartures),
  longHaulSharePct: pct(longHaulDepartures, departures),
});

/** Splits an airport's departing flights into long-haul vs. shorter, separately for passenger and all-cargo service. */
export function computeRouteMix(
  routes: readonly RouteSegment[],
  longHaulMiles: number,
  topN = 10,
): RouteMix {
  const isLong = (r: RouteSegment) => r.distanceMiles >= longHaulMiles;
  const sum = (items: readonly RouteSegment[], pick: (r: RouteSegment) => number) =>
    items.reduce((total, r) => total + pick(r), 0);

  const longRoutes = routes.filter(isLong);
  const paxDeps = sum(routes, (r) => r.passengerDepartures);
  const cargoDeps = sum(routes, (r) => r.cargoDepartures);
  const longPaxDeps = sum(longRoutes, (r) => r.passengerDepartures);
  const longCargoDeps = sum(longRoutes, (r) => r.cargoDepartures);
  const seats = sum(routes, (r) => r.seats);

  return {
    longHaulMiles,
    passenger: {
      ...share(paxDeps, longPaxDeps),
      seats: Math.round(seats),
      longHaulSeatSharePct: pct(
        sum(longRoutes, (r) => r.seats),
        seats,
      ),
    },
    cargo: share(cargoDeps, longCargoDeps),
    all: share(paxDeps + cargoDeps, longPaxDeps + longCargoDeps),
    internationalPassengerSharePct: pct(
      sum(
        routes.filter((r) => r.destCountry !== 'US'),
        (r) => r.passengerDepartures,
      ),
      paxDeps,
    ),
    destinations: new Set(routes.map((r) => r.dest)).size,
    topLongHaulRoutes: [...longRoutes]
      .sort(
        (a, b) =>
          b.passengerDepartures + b.cargoDepartures - (a.passengerDepartures + a.cargoDepartures),
      )
      .slice(0, topN)
      .map((r) => ({
        dest: r.dest,
        destName: r.destName,
        destCountry: r.destCountry,
        distanceMiles: r.distanceMiles,
        passengerDepartures: Math.round(r.passengerDepartures),
        cargoDepartures: Math.round(r.cargoDepartures),
      })),
  };
}
