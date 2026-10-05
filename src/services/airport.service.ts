import { statesForRegion } from '../config/regions.js';
import { computeKpis, KPI_DEFINITIONS, type AirportKpis, type KpiName } from '../domain/kpis.js';
import type { AirportRepository } from '../repositories/airport.repository.js';
import type { AirportFilter, SearchAirportsInput } from '../schemas/airport.schema.js';
import type { Airport } from '../types/airport.js';
import { NotFoundError } from '../utils/errors.js';
import { formatKpi } from '../utils/format.js';

const PROFILE_KPIS: KpiName[] = [
  'enplanements',
  'passengerDeparturesPerDay',
  'loadFactor',
  'passengerCagr',
  'recoveryVs2019',
  'delayRate',
  'nasDelayRate',
  'avgNasDelayMinutes',
  'cancellationRate',
  'avgFare',
  'fareIndex',
];

export class AirportService {
  private readonly kpis: readonly AirportKpis[];
  private readonly kpisByCode: ReadonlyMap<string, AirportKpis>;

  constructor(private readonly repo: AirportRepository) {
    // KPIs depend only on the immutable snapshot, so they are computed once at startup.
    this.kpis = repo.all().map(computeKpis);
    this.kpisByCode = new Map(this.kpis.map((k) => [k.code, k]));
  }

  /** Every tracked airport: the universe that percentiles are computed against. */
  allKpis(): readonly AirportKpis[] {
    return this.kpis;
  }

  requireAirport(code: string): Airport {
    const airport = this.repo.get(code);
    if (!airport) throw unknownAirports([code]);
    return airport;
  }

  /** Applies a filter (all criteria combined with AND). Explicit codes must all exist. */
  resolve(filter: AirportFilter): AirportKpis[] {
    if (filter.codes?.length) {
      const unknown = filter.codes.filter((c) => !this.kpisByCode.has(c));
      if (unknown.length) throw unknownAirports(unknown);
    }
    const regionStates = filter.region ? new Set(statesForRegion(filter.region)) : undefined;
    const states = filter.states ? new Set(filter.states) : undefined;
    const codes = filter.codes ? new Set(filter.codes) : undefined;
    const hubSizes = filter.hubSizes ? new Set(filter.hubSizes) : undefined;
    const query = filter.query?.toLowerCase();

    return this.kpis.filter((k) => {
      if (regionStates && !regionStates.has(k.state)) return false;
      if (states && !states.has(k.state)) return false;
      if (codes && !codes.has(k.code)) return false;
      if (hubSizes && !hubSizes.has(k.hubSize)) return false;
      if (query) {
        const airport = this.repo.get(k.code)!;
        const haystack = `${airport.name} ${airport.city}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  search(input: SearchAirportsInput) {
    const matches = this.resolve(input);
    return {
      total: matches.length,
      airports: matches.slice(0, input.limit).map((k) => {
        const a = this.repo.get(k.code)!;
        return {
          code: k.code,
          name: a.name,
          city: a.city,
          state: a.state,
          hubSize: k.hubSize,
          enplanements: formatKpi('enplanements', k.enplanements),
        };
      }),
    };
  }

  profile(code: string) {
    const airport = this.requireAirport(code);
    const k = this.kpisByCode.get(airport.code)!;
    const caveats: string[] = [];
    if (!airport.delays)
      caveats.push('No BTS delay data (airport not served by reporting carriers).');
    if (!airport.fares)
      caveats.push('No DOT fare data (airport not covered by Consumer Airfare Table 1a).');

    return {
      airport: {
        code: airport.code,
        name: airport.name,
        city: airport.city,
        state: airport.state,
        hubSize: airport.hubSize,
      },
      kpis: PROFILE_KPIS.map((kpi) => ({
        kpi,
        label: KPI_DEFINITIONS[kpi].label,
        value: k[kpi],
        display: formatKpi(kpi, k[kpi]),
      })),
      trafficHistory: airport.traffic.map((t) => ({
        year: t.year,
        enplanements: formatKpi('enplanements', t.passengers),
        seats: formatKpi('enplanements', t.seats),
        loadFactor: formatKpi('loadFactor', t.seats ? t.passengers / t.seats : null),
        passengerDepartures: formatKpi('enplanements', t.passengerDepartures),
      })),
      dataPeriods: {
        traffic: `${airport.traffic[0]?.year}–${airport.traffic.at(-1)?.year}`,
        delays: airport.delays
          ? `${airport.delays.periodStart} to ${airport.delays.periodEnd}`
          : null,
        fares: airport.fares?.period ?? null,
      },
      knownConstraints: this.repo.constraintsFor(airport.code),
      caveats,
    };
  }
}

function unknownAirports(codes: string[]) {
  return new NotFoundError(
    `Unknown or untracked airport code(s): ${codes.join(', ')}. ` +
      'Only US airports with more than 10,000 annual enplanements are tracked.',
  );
}
