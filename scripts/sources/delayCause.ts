import type { DelayStats } from '../../src/types/airport.js';
import { cachedDownload, fetchBuffer, num, parseZippedCsv } from './http.js';

/** BTS Airline On-Time Statistics and Delay Causes: monthly arrival performance per carrier and airport. */
const BASE = 'https://www.transtats.bts.gov/OT_Delay/';
const FORM = `${BASE}OT_DelayCause1.asp?20=E`;

/** The form encodes a month as year * 12 + month. */
const decodePeriod = (value: number) => {
  const year = Math.floor((value - 1) / 12);
  return `${year}-${String(value - year * 12).padStart(2, '0')}`;
};

async function latestAvailablePeriod(): Promise<number> {
  const html = await (await fetch(FORM, { signal: AbortSignal.timeout(60_000) })).text();
  const select = html.slice(html.indexOf("NAME='PeriodTo'"));
  const latest = select.match(/VALUE\s*=\s*'?(\d+)/i)?.[1];
  if (!latest) throw new Error('Could not detect latest delay-cause period');
  return Number(latest);
}

async function download(from: number, to: number): Promise<Buffer> {
  const body = new URLSearchParams({
    Carrier: 'All',
    Airport: 'All',
    PeriodFrom: String(from),
    PeriodTo: String(to),
  });
  const html = await (
    await fetch(FORM, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(60_000),
    })
  ).text();
  const link = html.match(/href='(ot_delaycause1_DL\.aspx\?[^']+)'/i)?.[1];
  if (!link) throw new Error('Delay-cause download link not found');
  return fetchBuffer(BASE + encodeURI(link));
}

/** Aggregates the most recent 12 months of arrival performance per airport. */
export async function loadDelayStats(): Promise<Map<string, DelayStats>> {
  const to = await latestAvailablePeriod();
  const from = to - 11;
  const periodStart = decodePeriod(from);
  const periodEnd = decodePeriod(to);
  const zip = await cachedDownload(`delay_cause_${periodStart}_${periodEnd}.zip`, () =>
    download(from, to),
  );

  const stats = new Map<string, DelayStats>();
  for (const row of parseZippedCsv(zip)) {
    const code = row.airport;
    if (!code) continue;
    const s = stats.get(code) ?? {
      periodStart,
      periodEnd,
      arrivals: 0,
      delayed15: 0,
      nasDelayed: 0,
      nasDelayMinutes: 0,
      cancelled: 0,
    };
    s.arrivals += num(row.arr_flights);
    s.delayed15 += num(row.arr_del15);
    s.nasDelayed += num(row.nas_ct);
    s.nasDelayMinutes += num(row.nas_delay);
    s.cancelled += num(row.arr_cancelled);
    stats.set(code, s);
  }
  return stats;
}
