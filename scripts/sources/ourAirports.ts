import { cachedDownload, fetchBuffer, num, parseCsv } from './http.js';

/** OurAirports (public domain): names, municipalities, states and coordinates. */
const URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

export interface AirportInfo {
  code: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
}

export async function loadUsAirports(): Promise<Map<string, AirportInfo>> {
  const csv = await cachedDownload('ourairports.csv', () => fetchBuffer(URL));
  const airports = new Map<string, AirportInfo>();

  for (const row of parseCsv(csv)) {
    const code = row.iata_code;
    if (row.iso_country !== 'US' || !code || row.type === 'closed') continue;
    // Prefer the larger airport when an IATA code is shared (rare, but happens with heliports).
    if (airports.has(code) && row.type !== 'large_airport' && row.type !== 'medium_airport')
      continue;
    airports.set(code, {
      code,
      name: row.name ?? code,
      city: row.municipality ?? '',
      state: (row.iso_region ?? '').replace('US-', ''),
      lat: num(row.latitude_deg),
      lon: num(row.longitude_deg),
    });
  }
  return airports;
}
