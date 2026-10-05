/**
 * Mid-rank percentile (0–100) of `value` within `population`: ties count half,
 * so identical values get identical percentiles and the result does not depend on order.
 */
export function percentileRank(value: number, population: readonly number[]): number {
  if (population.length === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const p of population) {
    if (p < value) below++;
    else if (p === value) equal++;
  }
  return ((below + 0.5 * equal) / population.length) * 100;
}

/** Compound annual growth rate between two values `years` apart; null when undefined. */
export function cagr(start: number, end: number, years: number): number | null {
  if (start <= 0 || end < 0 || years <= 0) return null;
  return (end / start) ** (1 / years) - 1;
}

/** Division that returns null instead of NaN/Infinity for missing or zero denominators. */
export function ratio(
  numerator: number | undefined,
  denominator: number | undefined,
): number | null {
  if (numerator === undefined || !denominator) return null;
  return numerator / denominator;
}

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
