import type { Confidence, ToolStep } from '../types';

/** The fields of tool results the UI reads. Each tool returns a different subset. */
interface ToolResult {
  results?: { selectionRank?: number; code: string; score: number; confidence?: Confidence }[];
  mix?: {
    passenger: { longHaulSharePct: number | null };
    cargo: { longHaulSharePct: number | null };
  };
  definition?: string;
  directions?: { origin: string; dest: string; passengers?: string; status?: string }[];
  airport?: { name: string };
  kpis?: unknown;
  airports?: unknown[];
  total?: number;
  summary?: string;
  stale?: boolean;
  dataPeriods?: { traffic: string; delays?: string; fares?: string };
  year?: number;
  fetchedAt?: string;
  error?: string;
}

const CONFIDENCE_ORDER: Confidence[] = ['low', 'medium', 'high'];

/** One-line summary of a tool result for the trace panel. */
export function summarizeResult(raw: unknown): string {
  const r = raw as ToolResult;
  if (r.results) {
    return r.results
      .map(
        (x) =>
          `${x.selectionRank ? `${x.selectionRank}. ` : ''}${x.code} ${x.score} (${x.confidence ?? 'n/a'})`,
      )
      .join(' · ');
  }
  if (r.mix) {
    const { passenger, cargo } = r.mix;
    return `${r.definition}: passenger ${passenger.longHaulSharePct ?? 'n/a'}%, cargo ${cargo.longHaulSharePct ?? 'n/a'}%`;
  }
  if (r.directions) {
    return r.directions
      .map(
        (d) => `${d.origin}→${d.dest}: ${d.passengers ? `${d.passengers} passengers` : d.status}`,
      )
      .join(' · ');
  }
  if (r.airport && r.kpis) return `Profile of ${r.airport.name}`;
  if (r.airports) return `${r.total} airport(s) found`;
  if (r.summary) return `${r.summary}${r.stale ? ' (stale)' : ''}`;
  return 'done';
}

export function errorOf(raw: unknown): string {
  return (raw as ToolResult).error ?? 'unknown error';
}

/** The lowest confidence and the data periods across an answer's successful tool calls. */
export function collectMetadata(steps: ToolStep[]) {
  const confidences: Confidence[] = [];
  const periods = new Set<string>();

  for (const step of steps) {
    if (step.status !== 'ok') continue;
    const r = step.result as ToolResult;
    for (const x of r.results ?? []) if (x.confidence) confidences.push(x.confidence);
    if (r.dataPeriods) {
      const { traffic, delays, fares } = r.dataPeriods;
      periods.add(`Traffic ${traffic}`);
      if (delays) periods.add(`Delays ${delays}`);
      if (fares) periods.add(`Fares ${fares}`);
    }
    if (r.year && r.mix) periods.add(`Routes ${r.year}`);
    if (r.fetchedAt) periods.add(`Live FAA ${new Date(r.fetchedAt).toLocaleTimeString()}`);
  }

  const confidence = confidences.sort(
    (a, b) => CONFIDENCE_ORDER.indexOf(a) - CONFIDENCE_ORDER.indexOf(b),
  )[0];
  return { confidence, periods: [...periods] };
}
