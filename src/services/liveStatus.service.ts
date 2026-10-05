import { XMLParser } from 'fast-xml-parser';
import { UpstreamError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { TtlCache } from '../utils/ttlCache.js';

const FAA_STATUS_URL = 'https://nasstatus.faa.gov/api/airport-status-information';
const CACHE_KEY = 'faa-status';

export interface LiveEvent {
  type: string;
  details: Record<string, unknown>;
}

interface StatusDocument {
  updatedAt: string;
  fetchedAt: string;
  byAirport: Map<string, LiveEvent[]>;
}

export type StatusFetcher = () => Promise<string>;

const defaultFetcher: StatusFetcher = async () => {
  const res = await fetch(FAA_STATUS_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`FAA status API returned ${res.status}`);
  return res.text();
};

/**
 * Current FAA NAS status (ground stops, ground delay programs, closures, delays).
 * One upstream call covers every airport, so the whole document is cached briefly;
 * if a refresh fails, the last known document is served and flagged as stale.
 */
export class LiveStatusService {
  private readonly cache: TtlCache<StatusDocument>;

  constructor(
    private readonly fetcher: StatusFetcher = defaultFetcher,
    ttlMs = 2 * 60 * 1000,
  ) {
    this.cache = new TtlCache(ttlMs, 1);
  }

  async get(code: string) {
    const { doc, stale } = await this.document();
    const events = doc.byAirport.get(code.toUpperCase()) ?? [];
    return {
      code: code.toUpperCase(),
      faaUpdatedAt: doc.updatedAt,
      fetchedAt: doc.fetchedAt,
      stale,
      events,
      summary: events.length
        ? `${events.length} active FAA event(s)`
        : 'No active FAA delay programs or closures',
    };
  }

  private async document(): Promise<{ doc: StatusDocument; stale: boolean }> {
    const fresh = this.cache.get(CACHE_KEY);
    if (fresh) return { doc: fresh, stale: false };
    try {
      const doc = parseStatus(await this.fetcher());
      this.cache.set(CACHE_KEY, doc);
      return { doc, stale: false };
    } catch (err) {
      const last = this.cache.getStale(CACHE_KEY);
      logger.warn('FAA status refresh failed', { error: String(err), servingStale: !!last });
      if (last) return { doc: last, stale: true };
      throw new UpstreamError('FAA airport status service is unavailable right now.');
    }
  }
}

/** Walks the FAA XML and groups every element that names an airport (ARPT) under its delay type. */
export function parseStatus(xml: string): StatusDocument {
  const root =
    new XMLParser({ ignoreAttributes: true }).parse(xml).AIRPORT_STATUS_INFORMATION ?? {};
  const byAirport = new Map<string, LiveEvent[]>();

  const visit = (node: unknown, type: string) => {
    if (Array.isArray(node)) return node.forEach((n) => visit(n, type));
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record.ARPT === 'string') {
      const { ARPT, ...details } = record;
      const list = byAirport.get(ARPT) ?? [];
      list.push({ type, details });
      byAirport.set(ARPT, list);
      return;
    }
    Object.values(record).forEach((child) => visit(child, type));
  };

  const delayTypes = [root.Delay_type ?? []].flat() as Record<string, unknown>[];
  for (const delayType of delayTypes) visit(delayType, String(delayType.Name ?? 'Unknown'));

  return {
    updatedAt: String(root.Update_Time ?? ''),
    fetchedAt: new Date().toISOString(),
    byAirport,
  };
}
