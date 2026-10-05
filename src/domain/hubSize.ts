import type { HubSize } from '../types/airport.js';

/**
 * FAA hub classification by an airport's share of total US enplanements
 * (49 U.S.C. 40102): large ≥ 1%, medium 0.25–1%, small 0.05–0.25%, otherwise non-hub.
 */
export function classifyHub(enplanementShare: number): HubSize {
  if (enplanementShare >= 0.01) return 'large';
  if (enplanementShare >= 0.0025) return 'medium';
  if (enplanementShare >= 0.0005) return 'small';
  return 'nonhub';
}
