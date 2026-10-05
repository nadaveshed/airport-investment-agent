import type { FareStats } from '../../src/types/airport.js';
import { cachedDownload, fetchBuffer, num } from './http.js';

/** DOT Consumer Airfare Report, Table 1a: average fare and daily passengers per domestic airport-pair market. */
const DATASET = 'https://datahub.transportation.gov/resource/tfrh-tu9e.json';
const PAGE_SIZE = 50_000;
/** Fares rise with distance; comparing within 500-mile bands keeps long-haul airports from looking "expensive". */
const DISTANCE_BAND_MILES = 500;

interface Market {
  year: string;
  quarter: string;
  airport_1: string;
  airport_2: string;
  nsmiles: string;
  passengers: string;
  fare: string;
}

async function soql<T>(params: Record<string, string>): Promise<T[]> {
  const url = `${DATASET}?${new URLSearchParams(params)}`;
  return JSON.parse((await fetchBuffer(url)).toString('utf8')) as T[];
}

async function latestQuarters(count: number): Promise<{ year: string; quarter: string }[]> {
  return soql({
    $select: 'year, quarter',
    $group: 'year, quarter',
    $order: 'year DESC, quarter DESC',
    $limit: String(count),
  });
}

async function downloadMarkets(quarters: { year: string; quarter: string }[]): Promise<Buffer> {
  const where = quarters.map((q) => `(year=${q.year} AND quarter=${q.quarter})`).join(' OR ');
  const rows: Market[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await soql<Market>({
      $select: 'year, quarter, airport_1, airport_2, nsmiles, passengers, fare',
      $where: where,
      $order: 'tbl1apk',
      $limit: String(PAGE_SIZE),
      $offset: String(offset),
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return Buffer.from(JSON.stringify(rows));
}

/** Passenger-weighted fare per airport over the latest four quarters, plus a distance-adjusted fare index. */
export async function loadFareStats(): Promise<Map<string, FareStats>> {
  const quarters = await latestQuarters(4);
  const oldest = quarters.at(-1)!;
  const newest = quarters[0]!;
  const period = `${oldest.year}Q${oldest.quarter}–${newest.year}Q${newest.quarter}`;
  const raw = await cachedDownload(`fares_${period.replace('–', '_')}.json`, () =>
    downloadMarkets(quarters),
  );
  const markets = (JSON.parse(raw.toString('utf8')) as Market[]).map((m) => ({
    airports: [m.airport_1, m.airport_2],
    band: Math.floor(num(m.nsmiles) / DISTANCE_BAND_MILES),
    passengers: num(m.passengers),
    fare: num(m.fare),
  }));

  // National passenger-weighted average fare per distance band.
  const bandTotals = new Map<number, { revenue: number; passengers: number }>();
  for (const m of markets) {
    const t = bandTotals.get(m.band) ?? { revenue: 0, passengers: 0 };
    t.revenue += m.fare * m.passengers;
    t.passengers += m.passengers;
    bandTotals.set(m.band, t);
  }
  const bandAvg = (band: number) => {
    const t = bandTotals.get(band)!;
    return t.revenue / t.passengers;
  };

  const perAirport = new Map<string, { revenue: number; expected: number; passengers: number }>();
  for (const m of markets) {
    for (const code of m.airports) {
      const a = perAirport.get(code) ?? { revenue: 0, expected: 0, passengers: 0 };
      a.revenue += m.fare * m.passengers;
      a.expected += bandAvg(m.band) * m.passengers;
      a.passengers += m.passengers;
      perAirport.set(code, a);
    }
  }

  const quarterCount = quarters.length;
  return new Map(
    [...perAirport]
      .filter(([, a]) => a.passengers > 0)
      .map(([code, a]) => [
        code,
        {
          period,
          avgFare: a.revenue / a.passengers,
          fareIndex: a.revenue / a.expected,
          marketPassengersPerDay: a.passengers / quarterCount,
        },
      ]),
  );
}
