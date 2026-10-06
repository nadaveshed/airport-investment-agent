import type { KpiName } from '../domain/kpis.js';

export type IndexName = 'expansionOpportunity' | 'congestion' | 'unmetDemand';

export interface IndexDefinition {
  label: string;
  description: string;
  /**
   * Peer group for percentile normalization. `hubSize` compares an airport with peers of the same
   * FAA hub class (so a growing small hub is not drowned out by ATL). `all` compares against every tracked airport.
   */
  cohort: 'hubSize' | 'all';
  /** Weights sum to 1. Every KPI is "higher = stronger signal". */
  weights: Partial<Record<KpiName, number>>;
}

/**
 * The single source of truth for every composite index. Changing a weight here changes the
 * ranking everywhere: REST, agent and tests.
 */
export const INDEX_DEFINITIONS: Record<IndexName, IndexDefinition> = {
  expansionOpportunity: {
    label: 'Expansion Opportunity Score',
    description:
      'Demand-driven case for adding terminal/flight capacity: growing, full, saturated airports with scale and pricing power.',
    cohort: 'hubSize',
    weights: {
      passengerCagr: 0.3,
      loadFactor: 0.25,
      nasDelayRate: 0.2,
      enplanements: 0.15,
      fareIndex: 0.1,
    },
  },
  congestion: {
    label: 'Congestion Index',
    description:
      'Historical congestion signals from the snapshot, compared with all tracked US airports. Does not isolate terminal capacity.',
    cohort: 'all',
    weights: {
      nasDelayRate: 0.4,
      avgNasDelayMinutes: 0.2,
      delayRate: 0.2,
      loadFactor: 0.2,
    },
  },
  unmetDemand: {
    label: 'Unmet Demand Proxy',
    description:
      'Potential demand pressure: full planes, premium fares and NAS-attributed delays. A proxy, not a count of unserved passengers or proof of a terminal capacity bottleneck.',
    cohort: 'all',
    weights: {
      loadFactor: 0.4,
      fareIndex: 0.3,
      nasDelayRate: 0.3,
    },
  },
};

/** Default distance above which a route counts as long-haul (statute miles, ≈ 6+ hours block time). */
export const DEFAULT_LONG_HAUL_MILES = 3000;
