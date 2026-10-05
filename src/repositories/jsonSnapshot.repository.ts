import { readFileSync } from 'node:fs';
import type { Airport, AirportConstraint, RouteSegment, Snapshot } from '../types/airport.js';
import type { AirportRepository, DatasetInfo } from './airport.repository.js';

/** Loads the ingested snapshot into memory once; all reads are synchronous lookups. */
export class JsonSnapshotRepository implements AirportRepository {
  private readonly airports: readonly Airport[];
  private readonly byCode: ReadonlyMap<string, Airport>;
  private readonly routesByOrigin: ReadonlyMap<string, RouteSegment[]>;
  private readonly constraintsByCode: ReadonlyMap<string, AirportConstraint[]>;
  private readonly dataset: DatasetInfo;

  constructor(snapshot: Snapshot, constraints: readonly AirportConstraint[] = []) {
    this.airports = snapshot.airports;
    this.byCode = new Map(snapshot.airports.map((a) => [a.code, a]));
    this.routesByOrigin = groupBy(snapshot.routes, (r) => r.origin);
    this.constraintsByCode = groupBy(constraints, (c) => c.code);
    this.dataset = {
      generatedAt: snapshot.generatedAt,
      latestYear: snapshot.latestYear,
      sources: snapshot.sources,
    };
  }

  static fromFiles(snapshotPath: string, constraintsPath: string): JsonSnapshotRepository {
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Snapshot;
    const constraints = JSON.parse(readFileSync(constraintsPath, 'utf8')) as AirportConstraint[];
    return new JsonSnapshotRepository(snapshot, constraints);
  }

  all() {
    return this.airports;
  }

  get(code: string) {
    return this.byCode.get(code.toUpperCase());
  }

  routesFrom(code: string) {
    return this.routesByOrigin.get(code.toUpperCase()) ?? [];
  }

  constraintsFor(code: string) {
    return this.constraintsByCode.get(code.toUpperCase()) ?? [];
  }

  info() {
    return this.dataset;
  }
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
