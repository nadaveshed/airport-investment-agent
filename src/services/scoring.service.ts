import {
  INDEX_DEFINITIONS,
  type IndexDefinition,
  type IndexName,
} from '../config/scoring.config.js';
import type { KpiName } from '../domain/kpis.js';
import { rankAirports, type ScoreResult } from '../domain/scoring.js';
import type { AirportRepository } from '../repositories/airport.repository.js';
import type { CompareAirportsInput, RankAirportsInput } from '../schemas/airport.schema.js';
import { ValidationError } from '../utils/errors.js';
import { formatKpi } from '../utils/format.js';
import { round } from '../utils/math.js';
import type { AirportService } from './airport.service.js';

/**
 * Orchestrates the pure scoring engine. Full national rankings take a few milliseconds,
 * so results are computed on demand rather than cached.
 */
export class ScoringService {
  constructor(
    private readonly airports: AirportService,
    private readonly repo: AirportRepository,
  ) {}

  rank(input: RankAirportsInput) {
    const index = this.withWeights(input.index, input.weights);
    const candidates = this.airports.resolve(input);
    // Explicitly requested airports are never filtered out.
    const keepNonHubs = input.includeNonHubs || !!input.codes?.length;
    const eligible = keepNonHubs ? candidates : candidates.filter((k) => k.hubSize !== 'nonhub');
    const ranked = rankAirports(eligible, this.airports.allKpis(), index);

    return {
      index: this.describe(input.index, index),
      candidates: eligible.length,
      excludedNonHubs: candidates.length - eligible.length,
      results: ranked.slice(0, input.limit).map((r) => this.present(r)),
    };
  }

  compare(input: CompareAirportsInput) {
    const index = INDEX_DEFINITIONS[input.index];
    const targets = this.airports.resolve({ codes: input.codes });
    const ranked = rankAirports(targets, this.airports.allKpis(), index);
    return {
      index: this.describe(input.index, index),
      results: ranked.map((r) => this.present(r)),
    };
  }

  /** Merges weight overrides into the index defaults and re-normalizes them to sum to 1. */
  private withWeights(
    name: IndexName,
    overrides?: Partial<Record<KpiName, number>>,
  ): IndexDefinition {
    const base = INDEX_DEFINITIONS[name];
    if (!overrides || Object.keys(overrides).length === 0) return base;

    const unknown = Object.keys(overrides).filter((k) => !(k in base.weights));
    if (unknown.length) {
      throw new ValidationError(
        `KPI(s) ${unknown.join(', ')} are not part of ${base.label}. ` +
          `Allowed: ${Object.keys(base.weights).join(', ')}.`,
      );
    }
    const merged = { ...base.weights, ...overrides };
    const total = Object.values(merged).reduce((s, w) => s + (w ?? 0), 0);
    if (total <= 0) throw new ValidationError('At least one weight must be positive.');
    const weights = Object.fromEntries(
      Object.entries(merged).map(([k, w]) => [k, (w ?? 0) / total]),
    ) as IndexDefinition['weights'];
    return { ...base, weights };
  }

  private describe(name: IndexName, index: IndexDefinition) {
    return {
      name,
      label: index.label,
      description: index.description,
      cohort:
        index.cohort === 'hubSize' ? 'peers of the same FAA hub size' : 'all tracked US airports',
      weights: Object.fromEntries(
        Object.entries(index.weights).map(([k, w]) => [k, `${round((w ?? 0) * 100)}%`]),
      ),
      customWeights: index !== INDEX_DEFINITIONS[name],
    };
  }

  private present(result: ScoreResult) {
    return {
      ...result,
      components: result.components.map((c) => ({ ...c, display: formatKpi(c.kpi, c.value) })),
      knownConstraints: this.repo.constraintsFor(result.code).map((c) => c.constraint),
    };
  }
}
