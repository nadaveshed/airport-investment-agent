import type { Airport, HubSize } from '../types/airport.js';
import { cagr, ratio } from '../utils/math.js';

/** Raw, unnormalized indicators per airport. `null` means the source has no data for this airport. */
export interface AirportKpis {
  code: string;
  name: string;
  state: string;
  hubSize: HubSize;
  enplanements: number;
  passengerDeparturesPerDay: number;
  loadFactor: number | null;
  passengerCagr: number | null;
  recoveryVs2019: number | null;
  delayRate: number | null;
  nasDelayRate: number | null;
  avgNasDelayMinutes: number | null;
  cancellationRate: number | null;
  avgFare: number | null;
  fareIndex: number | null;
}

export type KpiName = Exclude<keyof AirportKpis, 'code' | 'name' | 'state' | 'hubSize'>;

export interface KpiDefinition {
  label: string;
  description: string;
  unit: 'count' | 'ratio' | 'minutes' | 'usd' | 'index';
  sourceId: 't100' | 'delays' | 'fares';
}

export const KPI_DEFINITIONS: Record<KpiName, KpiDefinition> = {
  enplanements: {
    label: 'Annual enplanements',
    description: 'Passengers boarding departing flights in the latest full year',
    unit: 'count',
    sourceId: 't100',
  },
  passengerDeparturesPerDay: {
    label: 'Passenger departures / day',
    description: 'Average daily departures of passenger flights',
    unit: 'count',
    sourceId: 't100',
  },
  loadFactor: {
    label: 'Load factor',
    description: 'Passengers ÷ seats on departing flights; high values mean planes are full',
    unit: 'ratio',
    sourceId: 't100',
  },
  passengerCagr: {
    label: 'Passenger growth (CAGR)',
    description: 'Compound annual growth in enplanements over the last two years',
    unit: 'ratio',
    sourceId: 't100',
  },
  recoveryVs2019: {
    label: 'Traffic vs 2019',
    description: 'Latest-year enplanements relative to pre-pandemic 2019',
    unit: 'ratio',
    sourceId: 't100',
  },
  delayRate: {
    label: 'Arrival delay rate',
    description: 'Share of arrivals delayed 15+ minutes (all causes)',
    unit: 'ratio',
    sourceId: 'delays',
  },
  nasDelayRate: {
    label: 'NAS delay rate',
    description:
      'NAS-attributed equivalent delayed flights divided by all scheduled arrivals. BTS prorates a delayed flight across causes by their delay minutes, so this is not the share of flights delayed mainly by NAS. Includes traffic volume, ATC, airport operations and non-extreme weather; does not isolate terminal congestion',
    unit: 'ratio',
    sourceId: 'delays',
  },
  avgNasDelayMinutes: {
    label: 'NAS delay min / arrival',
    description: 'NAS-attributed delay minutes per arrival',
    unit: 'minutes',
    sourceId: 'delays',
  },
  cancellationRate: {
    label: 'Cancellation rate',
    description: 'Share of scheduled arrivals cancelled',
    unit: 'ratio',
    sourceId: 'delays',
  },
  avgFare: {
    label: 'Average fare',
    description: 'Passenger-weighted average domestic one-way fare',
    unit: 'usd',
    sourceId: 'fares',
  },
  fareIndex: {
    label: 'Fare index',
    description:
      'Average fare relative to the national average for the same distance band (1.00 = national). Above 1 suggests demand exceeds supply',
    unit: 'index',
    sourceId: 'fares',
  },
};

/** Years over which passenger growth is measured, ending at the latest year (post-pandemic trend). */
export const GROWTH_WINDOW_YEARS = 2;

export function computeKpis(airport: Airport): AirportKpis {
  const latest = airport.traffic.at(-1);
  if (!latest) throw new Error(`Airport ${airport.code} has no traffic data`);
  const base = airport.traffic.find((t) => t.year === latest.year - GROWTH_WINDOW_YEARS);
  const pre = airport.traffic.find((t) => t.year === 2019);
  const d = airport.delays;

  return {
    code: airport.code,
    name: airport.name,
    state: airport.state,
    hubSize: airport.hubSize,
    enplanements: latest.passengers,
    passengerDeparturesPerDay: latest.passengerDepartures / 365,
    loadFactor: ratio(latest.passengers, latest.seats),
    passengerCagr: base ? cagr(base.passengers, latest.passengers, GROWTH_WINDOW_YEARS) : null,
    recoveryVs2019: ratio(latest.passengers, pre?.passengers),
    delayRate: ratio(d?.delayed15, d?.arrivals),
    nasDelayRate: ratio(d?.nasDelayed, d?.arrivals),
    avgNasDelayMinutes: ratio(d?.nasDelayMinutes, d?.arrivals),
    cancellationRate: ratio(d?.cancelled, d?.arrivals),
    avgFare: airport.fares?.avgFare ?? null,
    fareIndex: airport.fares?.fareIndex ?? null,
  };
}
