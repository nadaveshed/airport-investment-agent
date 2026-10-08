import { z } from 'zod';
import { REGION_NAMES } from '../config/regions.js';
import { DEFAULT_LONG_HAUL_MILES } from '../config/scoring.config.js';
import { KPI_DEFINITIONS, type KpiName } from '../domain/kpis.js';

/*
 * Service input schemas. They validate REST requests and agent tool calls, and they are
 * converted to the JSON Schema the LLM sees, so descriptions here are written for the model.
 */

export const airportCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3}$/, 'Expected a 3-letter IATA airport code')
  .describe('3-letter IATA airport code, e.g. "SFO"');

export const hubSizeSchema = z.enum(['large', 'medium', 'small', 'nonhub']);
export const indexNameSchema = z.enum(['expansionOpportunity', 'congestion', 'unmetDemand']);
export const regionSchema = z.enum(REGION_NAMES as [string, ...string[]]);
/** One optional weight per KPI. An explicit object (not a record) keeps the tool schema simple for LLMs. */
const weightsSchema = z
  .object(
    Object.fromEntries(
      (Object.keys(KPI_DEFINITIONS) as KpiName[]).map((k) => [
        k,
        z.number().min(0).max(1).optional(),
      ]),
    ) as Record<KpiName, z.ZodOptional<z.ZodNumber>>,
  )
  .strict();

export const airportFilterSchema = z.object({
  region: regionSchema.optional().describe('US region (Census division or common grouping)'),
  states: z
    .array(z.string().trim().toUpperCase().length(2))
    .optional()
    .describe('USPS state codes, e.g. ["CA", "OR"]'),
  codes: z.array(airportCodeSchema).optional().describe('Restrict to these airports'),
  hubSizes: z
    .array(hubSizeSchema)
    .optional()
    .describe('FAA hub classes by share of US enplanements'),
  query: z
    .string()
    .trim()
    .min(2)
    .optional()
    .describe('Case-insensitive match on airport name or city'),
});
export type AirportFilter = z.infer<typeof airportFilterSchema>;

export const searchAirportsSchema = airportFilterSchema.extend({
  limit: z.number().int().min(1).max(50).default(20),
});
export type SearchAirportsInput = z.infer<typeof searchAirportsSchema>;

export const airportProfileSchema = z.object({ code: airportCodeSchema });
export type AirportProfileInput = z.infer<typeof airportProfileSchema>;

export const rankAirportsSchema = airportFilterSchema.extend({
  index: indexNameSchema.default('expansionOpportunity'),
  weights: weightsSchema
    .optional()
    .describe(
      'Optional weight overrides for KPIs of the chosen index, e.g. {"passengerCagr": 0.5}. Missing KPIs keep their default; weights are re-normalized to sum to 1.',
    ),
  includeNonHubs: z
    .boolean()
    .default(false)
    .describe(
      'Non-hub airports (<0.05% of US enplanements) are excluded by default because they are rarely terminal-investment targets',
    ),
  limit: z.number().int().min(1).max(50).default(10),
});
export type RankAirportsInput = z.infer<typeof rankAirportsSchema>;

export const compareAirportsSchema = z.object({
  codes: z
    .array(airportCodeSchema)
    .min(2)
    .max(8)
    .refine((codes) => new Set(codes).size === codes.length, 'Airport codes must be distinct'),
  index: indexNameSchema.default('congestion'),
});
export type CompareAirportsInput = z.infer<typeof compareAirportsSchema>;

export const routeMixSchema = z.object({
  code: airportCodeSchema,
  longHaulMiles: z
    .number()
    .int()
    .min(500)
    .max(9000)
    .default(DEFAULT_LONG_HAUL_MILES)
    .describe(
      `Distance (statute miles) at or above which a route counts as long-haul. Default ${DEFAULT_LONG_HAUL_MILES}`,
    ),
});
export type RouteMixInput = z.infer<typeof routeMixSchema>;

export const routeSchema = z.object({
  from: airportCodeSchema.describe('Origin IATA code; may be a foreign airport, e.g. "TLV"'),
  to: airportCodeSchema.describe('Destination IATA code; may be a foreign airport'),
});
export type RouteInput = z.infer<typeof routeSchema>;

/* REST adapters: query strings arrive as strings, so lists are comma-separated and numbers are coerced. */

const WEIGHT_PAIR = String.raw`\s*[A-Za-z]+\s*:\s*(?:\d+(?:\.\d+)?|\.\d+)\s*`;
const WEIGHT_PAIRS = new RegExp(`^${WEIGHT_PAIR}(?:,${WEIGHT_PAIR})*$`);

/** Item validation happens in the piped service schema. */
const csvList = z.string().transform((s) =>
  s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
);

export const searchAirportsQuery = z
  .object({
    region: z.string().optional(),
    states: csvList.optional(),
    codes: csvList.optional(),
    hubSizes: csvList.optional(),
    query: z.string().optional(),
    limit: z.coerce.number().optional(),
  })
  .pipe(searchAirportsSchema);

export const rankAirportsQuery = z
  .object({
    region: z.string().optional(),
    states: csvList.optional(),
    codes: csvList.optional(),
    hubSizes: csvList.optional(),
    query: z.string().optional(),
    index: z.string().optional(),
    weights: z
      .string()
      // Every pair needs a name and a number; "loadFactor" or "loadFactor:" used to become 0.
      .regex(WEIGHT_PAIRS, 'Expected "kpi:weight" pairs, e.g. "passengerCagr:0.5,loadFactor:0.2"')
      .transform((s) =>
        Object.fromEntries(
          s.split(',').map((pair) => {
            const [k = '', v = ''] = pair.split(':');
            return [k.trim(), Number(v)];
          }),
        ),
      )
      .optional()
      .describe('e.g. "passengerCagr:0.5,loadFactor:0.2"'),
    includeNonHubs: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    limit: z.coerce.number().optional(),
  })
  .pipe(rankAirportsSchema);

export const compareAirportsQuery = z
  .object({ codes: csvList, index: z.string().optional() })
  .pipe(compareAirportsSchema);

export const routeMixQuery = z
  .object({ longHaulMiles: z.coerce.number().optional() })
  .pipe(routeMixSchema.omit({ code: true }));
