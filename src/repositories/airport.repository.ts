import type { Airport, AirportConstraint, RouteSegment, SourceInfo } from '../types/airport.js';

export interface DatasetInfo {
  generatedAt: string;
  latestYear: number;
  sources: SourceInfo[];
}

/**
 * Read access to airport data. The app depends on this interface only, so the JSON snapshot
 * can be replaced by a database without touching services or the agent.
 */
export interface AirportRepository {
  all(): readonly Airport[];
  get(code: string): Airport | undefined;
  routesFrom(code: string): readonly RouteSegment[];
  constraintsFor(code: string): readonly AirportConstraint[];
  info(): DatasetInfo;
}
