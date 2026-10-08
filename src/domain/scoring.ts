import type { IndexDefinition } from '../config/scoring.config.js';
import { percentileRank, round } from '../utils/math.js';
import { KPI_DEFINITIONS, type AirportKpis, type KpiName } from './kpis.js';

export type Confidence = 'high' | 'medium' | 'low';

export interface ScoreComponent {
  kpi: KpiName;
  label: string;
  value: number | null;
  /** Percentile within the cohort (0–100); null when the airport has no data for this KPI. */
  percentile: number | null;
  /** Configured weight. */
  weight: number;
  /** Weight actually applied after redistributing weights of missing KPIs. */
  appliedWeight: number;
  /** Points this component adds to the 0–100 score. */
  contribution: number;
}

export interface ScoreResult {
  code: string;
  name: string;
  state: string;
  hubSize: AirportKpis['hubSize'];
  score: number;
  /** Position among the selected candidates, not among the normalization peers. */
  selectionRank?: number;
  cohort: string;
  cohortSize: number;
  components: ScoreComponent[];
  /** Components with data, largest contribution first, so explanations don't have to sort them. */
  contributionOrder: { kpi: KpiName; label: string; contribution: number }[];
  confidence: Confidence;
  caveats: string[];
}

/** Minimum peer-group size for percentiles to be meaningful. */
const MIN_COHORT_SIZE = 10;

function cohortOf(target: AirportKpis, universe: readonly AirportKpis[], index: IndexDefinition) {
  if (index.cohort === 'all') return { label: 'all tracked US airports', members: universe };
  return {
    label: `${target.hubSize} hubs`,
    members: universe.filter((a) => a.hubSize === target.hubSize),
  };
}

/**
 * Scores one airport on a composite index: each KPI becomes a percentile within the cohort,
 * and the score is the weighted sum. Missing KPIs drop out and their weight is spread
 * proportionally over the remaining ones, which lowers confidence.
 */
export function scoreAirport(
  target: AirportKpis,
  universe: readonly AirportKpis[],
  index: IndexDefinition,
): ScoreResult {
  const cohort = cohortOf(target, universe, index);
  const weights = Object.entries(index.weights) as [KpiName, number][];
  const availableWeight = weights
    .filter(([kpi]) => target[kpi] !== null)
    .reduce((sum, [, w]) => sum + w, 0);

  // Rounding happens only for display, after the exact score is computed.
  let exactScore = 0;
  const components: ScoreComponent[] = weights.map(([kpi, weight]) => {
    const label = KPI_DEFINITIONS[kpi].label;
    const value = target[kpi];
    if (value === null || availableWeight === 0) {
      return { kpi, label, value, percentile: null, weight, appliedWeight: 0, contribution: 0 };
    }
    const population = cohort.members.map((a) => a[kpi]).filter((v): v is number => v !== null);
    const percentile = percentileRank(value, population);
    const appliedWeight = weight / availableWeight;
    exactScore += percentile * appliedWeight;
    return {
      kpi,
      label,
      value,
      percentile: round(percentile),
      weight,
      appliedWeight: round(appliedWeight, 3),
      contribution: round(percentile * appliedWeight),
    };
  });

  const missing = components.filter((c) => c.value === null);
  const missingWeight = missing.reduce((sum, c) => sum + c.weight, 0);
  const caveats = missing.map(
    (c) =>
      `No ${c.label.toLowerCase()} data; its ${Math.round(c.weight * 100)}% weight was redistributed.`,
  );
  if (cohort.members.length < MIN_COHORT_SIZE) {
    caveats.push(`Small peer group (${cohort.members.length} airports); percentiles are coarse.`);
  }

  let confidence: Confidence =
    missingWeight === 0 ? 'high' : missingWeight <= 0.25 ? 'medium' : 'low';
  if (cohort.members.length < MIN_COHORT_SIZE) confidence = 'low';

  return {
    code: target.code,
    name: target.name,
    state: target.state,
    hubSize: target.hubSize,
    score: round(exactScore),
    cohort: cohort.label,
    cohortSize: cohort.members.length,
    components,
    contributionOrder: components
      .filter((c) => c.value !== null)
      .sort((a, b) => b.contribution - a.contribution)
      .map(({ kpi, label, contribution }) => ({ kpi, label, contribution })),
    confidence,
    caveats,
  };
}

/** Scores the targets against the full universe and orders them by score (ties broken by code for determinism). */
export function rankAirports(
  targets: readonly AirportKpis[],
  universe: readonly AirportKpis[],
  index: IndexDefinition,
): ScoreResult[] {
  return targets
    .map((t) => scoreAirport(t, universe, index))
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
    .map((r, i) => ({ ...r, selectionRank: i + 1 }));
}
