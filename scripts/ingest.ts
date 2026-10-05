/**
 * Builds data/snapshot.json from public sources. Raw downloads are cached in data/raw/,
 * so re-runs are fast; delete that folder to force a refresh.
 *
 *   npm run ingest
 */
import { writeFile } from 'node:fs/promises';
import { classifyHub } from '../src/domain/hubSize.js';
import type { Airport, RouteSegment, Snapshot, YearlyTraffic } from '../src/types/airport.js';
import { loadDelayStats } from './sources/delayCause.js';
import { loadFareStats } from './sources/fares.js';
import { loadUsAirports } from './sources/ourAirports.js';
import { loadT100Year, type SegmentAggregate } from './sources/t100.js';

/** 2019 is the pre-pandemic baseline; the last three years give a post-recovery growth trend. */
const YEARS = [2019, 2023, 2024, 2025] as const;
const LATEST_YEAR = YEARS.at(-1)!;
/** FAA "primary airport" threshold: more than 10,000 annual enplanements. */
const MIN_ENPLANEMENTS = 10_000;
const OUTPUT = 'data/snapshot.json';

function trafficByOrigin(year: number, segments: SegmentAggregate[]): Map<string, YearlyTraffic> {
  const totals = new Map<string, YearlyTraffic>();
  for (const s of segments) {
    if (s.originCountry !== 'US') continue;
    const t = totals.get(s.origin) ?? {
      year,
      passengers: 0,
      seats: 0,
      passengerDepartures: 0,
      freightLbs: 0,
    };
    t.passengers += s.passengers;
    t.seats += s.seats;
    t.passengerDepartures += s.passengerDepartures;
    t.freightLbs += s.freightLbs;
    totals.set(s.origin, t);
  }
  return totals;
}

async function main() {
  console.log('Loading airport metadata, delays and fares…');
  const [airportInfo, delays, fares] = await Promise.all([
    loadUsAirports(),
    loadDelayStats(),
    loadFareStats(),
  ]);

  const segmentsByYear = new Map<number, SegmentAggregate[]>();
  for (const year of YEARS) {
    console.log(`Loading T-100 ${year}…`);
    segmentsByYear.set(year, await loadT100Year(year));
  }
  const trafficByYear = new Map(YEARS.map((y) => [y, trafficByOrigin(y, segmentsByYear.get(y)!)]));

  const latest = trafficByYear.get(LATEST_YEAR)!;
  const totalEnplanements = [...latest.values()].reduce((sum, t) => sum + t.passengers, 0);

  const airports: Airport[] = [];
  for (const [code, current] of latest) {
    const info = airportInfo.get(code);
    if (!info || current.passengers < MIN_ENPLANEMENTS) continue;
    airports.push({
      ...info,
      hubSize: classifyHub(current.passengers / totalEnplanements),
      traffic: YEARS.map((y) => trafficByYear.get(y)!.get(code)).filter(
        (t): t is YearlyTraffic => !!t,
      ),
      delays: delays.get(code),
      fares: fares.get(code),
    });
  }
  airports.sort((a, b) => b.traffic.at(-1)!.passengers - a.traffic.at(-1)!.passengers);

  const tracked = new Set(airports.map((a) => a.code));
  const routes: RouteSegment[] = segmentsByYear
    .get(LATEST_YEAR)!
    .filter((s) => tracked.has(s.origin))
    .map(({ originCountry: _originCountry, ...route }) => ({
      ...route,
      destName: airportInfo.get(route.dest)?.name ?? route.destName,
    }));

  const anyDelay = delays.values().next().value;
  const anyFare = fares.values().next().value;
  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    latestYear: LATEST_YEAR,
    sources: [
      {
        id: 't100',
        name: 'BTS T-100 Segment (All Carriers)',
        url: 'https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FMG',
        period: `${YEARS.join(', ')} (calendar years)`,
      },
      {
        id: 'delays',
        name: 'BTS Airline On-Time Statistics and Delay Causes',
        url: 'https://www.transtats.bts.gov/OT_Delay/OT_DelayCause1.asp',
        period: anyDelay ? `${anyDelay.periodStart} to ${anyDelay.periodEnd}` : 'n/a',
      },
      {
        id: 'fares',
        name: 'DOT Consumer Airfare Report, Table 1a',
        url: 'https://data.transportation.gov/d/tfrh-tu9e',
        period: anyFare?.period ?? 'n/a',
      },
      {
        id: 'ourairports',
        name: 'OurAirports',
        url: 'https://ourairports.com/data/',
        period: 'current',
      },
    ],
    airports,
    routes,
  };

  await writeFile(OUTPUT, JSON.stringify(snapshot));
  console.log(
    `Wrote ${OUTPUT}: ${airports.length} airports, ${routes.length} routes, ` +
      `${airports.filter((a) => a.delays).length} with delay data, ${airports.filter((a) => a.fares).length} with fare data.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
