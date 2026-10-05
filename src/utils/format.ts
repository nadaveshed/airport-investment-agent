import { KPI_DEFINITIONS, type KpiName } from '../domain/kpis.js';

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Human-readable KPI values. Formatting happens server-side so the LLM quotes numbers
 * instead of converting ratios to percentages itself.
 */
export function formatKpi(kpi: KpiName, value: number | null): string {
  if (value === null) return 'n/a';
  switch (KPI_DEFINITIONS[kpi].unit) {
    case 'count':
      return integer.format(value);
    case 'ratio':
      return `${(value * 100).toFixed(1)}%`;
    case 'minutes':
      return `${value.toFixed(1)} min`;
    case 'usd':
      return `$${value.toFixed(0)}`;
    case 'index':
      return value.toFixed(2);
  }
}
