import { cachedDownload, fetchBuffer, num, parseZippedCsv } from './http.js';

/**
 * BTS T-100 Segment (All Carriers): monthly flights, seats, passengers and freight per carrier and segment.
 * TranStats has no API; the download form is an ASP.NET page, so we replay its postback.
 */
const FORM_URL =
  'https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FMG&QO_fu146_anzr=Nv4%20Pn44vr45';

const FIELDS = [
  'YEAR',
  'MONTH',
  'ORIGIN',
  'ORIGIN_COUNTRY',
  'DEST',
  'DEST_CITY_NAME',
  'DEST_COUNTRY',
  'DISTANCE',
  'DEPARTURES_PERFORMED',
  'SEATS',
  'PASSENGERS',
  'FREIGHT',
  'CLASS',
];

/** Service classes: F/L carry passengers (scheduled/charter), G/P are all-cargo. */
const PASSENGER_CLASSES = new Set(['F', 'L']);

export interface SegmentAggregate {
  origin: string;
  originCountry: string;
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

async function downloadYear(year: number): Promise<Buffer> {
  const page = await fetch(FORM_URL, { signal: AbortSignal.timeout(60_000) });
  const html = await page.text();
  const cookie = page.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const hidden = (id: string) => html.match(new RegExp(`id="${id}" value="([^"]*)"`))?.[1] ?? '';

  const form = new URLSearchParams({
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __LASTFOCUS: '',
    __VIEWSTATE: hidden('__VIEWSTATE'),
    __VIEWSTATEGENERATOR: hidden('__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: hidden('__EVENTVALIDATION'),
    txtSearch: '',
    cboGeography: 'All',
    cboYear: String(year),
    cboPeriod: 'All',
    chkDownloadZip: 'on',
    btnDownload: 'Download',
  });
  for (const field of FIELDS) form.append(field, 'on');

  return fetchBuffer(FORM_URL, {
    method: 'POST',
    body: form,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
  });
}

/** Loads one calendar year and aggregates months and carriers into one row per origin → destination segment. */
export async function loadT100Year(year: number): Promise<SegmentAggregate[]> {
  const zip = await cachedDownload(`t100_segment_${year}.zip`, () => downloadYear(year));
  const segments = new Map<string, SegmentAggregate>();

  for (const row of parseZippedCsv(zip)) {
    const origin = row.ORIGIN ?? '';
    const dest = row.DEST ?? '';
    if (!origin || !dest || origin === dest) continue;

    const key = `${origin}-${dest}`;
    let seg = segments.get(key);
    if (!seg) {
      seg = {
        origin,
        originCountry: row.ORIGIN_COUNTRY ?? '',
        dest,
        destName: row.DEST_CITY_NAME ?? dest,
        destCountry: row.DEST_COUNTRY ?? '',
        distanceMiles: num(row.DISTANCE),
        passengerDepartures: 0,
        cargoDepartures: 0,
        seats: 0,
        passengers: 0,
        freightLbs: 0,
      };
      segments.set(key, seg);
    }

    const departures = num(row.DEPARTURES_PERFORMED);
    if (PASSENGER_CLASSES.has(row.CLASS ?? '')) seg.passengerDepartures += departures;
    else seg.cargoDepartures += departures;
    seg.seats += num(row.SEATS);
    seg.passengers += num(row.PASSENGERS);
    seg.freightLbs += num(row.FREIGHT);
  }

  return [...segments.values()].filter((s) => s.passengerDepartures + s.cargoDepartures > 0);
}
