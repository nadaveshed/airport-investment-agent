/** FAA-style hub classification by share of total US enplanements (computed from T-100). */
export type HubSize = 'large' | 'medium' | 'small' | 'nonhub';

export interface YearlyTraffic {
  year: number;
  /** Passengers enplaned on departing flights (scheduled + charter passenger service). */
  passengers: number;
  seats: number;
  passengerDepartures: number;
  freightLbs: number;
}

/** Arrival performance over a 12-month window (BTS Airline Delay Cause, reporting carriers only). */
export interface DelayStats {
  periodStart: string; // YYYY-MM
  periodEnd: string; // YYYY-MM
  /** Scheduled arrivals, including those later cancelled or diverted (BTS `arr_flights`). */
  arrivals: number;
  delayed15: number;
  /** Arrivals delayed primarily by the National Aviation System: volume, ATC, airport operations. */
  nasDelayed: number;
  nasDelayMinutes: number;
  cancelled: number;
}

/** Domestic O&D fares (DOT Consumer Airfare Report, Table 1a). */
export interface FareStats {
  period: string; // e.g. "2025Q3–2026Q2"
  avgFare: number;
  /** Passenger-weighted fare relative to the national average for the same distance band (1.0 = national). */
  fareIndex: number;
  marketPassengersPerDay: number;
}

export interface Airport {
  code: string; // IATA
  name: string;
  city: string;
  state: string; // USPS code, e.g. "MA"
  lat: number;
  lon: number;
  hubSize: HubSize;
  traffic: YearlyTraffic[]; // ascending by year
  delays?: DelayStats;
  fares?: FareStats;
}

/** Annual aggregate of all flights on an origin → destination segment (BTS T-100 Segment, all carriers). */
export interface RouteSegment {
  origin: string;
  dest: string;
  destName: string;
  destCountry: string;
  distanceMiles: number;
  passengerDepartures: number;
  cargoDepartures: number;
  seats: number;
  passengers: number;
  freightLbs: number;
}

export interface SourceInfo {
  id: string;
  name: string;
  url: string;
  period: string;
}

export interface Snapshot {
  generatedAt: string;
  latestYear: number;
  sources: SourceInfo[];
  airports: Airport[];
  /** Segments departing tracked airports, latest full year only. */
  routes: RouteSegment[];
}

/** Hand-curated, sourced structural constraint used to explain "why" (never used in scoring). */
export interface AirportConstraint {
  code: string;
  constraint: string;
  impact: string;
  sourceUrl: string;
  curated: true;
}
