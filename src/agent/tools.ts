import type { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';
import { z } from 'zod';
import {
  airportProfileSchema,
  compareAirportsSchema,
  rankAirportsSchema,
  routeMixSchema,
  searchAirportsSchema,
} from '../schemas/airport.schema.js';
import type { AirportService } from '../services/airport.service.js';
import type { LiveStatusService } from '../services/liveStatus.service.js';
import type { RouteMixService } from '../services/routeMix.service.js';
import type { ScoringService } from '../services/scoring.service.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface Tool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  handler: (input: z.output<S>) => unknown;
}

const defineTool = <S extends z.ZodType>(tool: Tool<S>): Tool => tool as unknown as Tool;

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string };

export interface ToolServices {
  airports: AirportService;
  scoring: ScoringService;
  routeMix: RouteMixService;
  liveStatus: LiveStatusService;
}

/** Each tool is a thin adapter: schema in, service call, JSON out. No business logic lives here. */
export function createTools(services: ToolServices): Tool[] {
  return [
    defineTool({
      name: 'find_airports',
      description:
        'Find tracked US airports by region, state, hub size or name. Use it to resolve city names to IATA codes or to list candidates.',
      schema: searchAirportsSchema,
      handler: (input) => services.airports.search(input),
    }),
    defineTool({
      name: 'get_airport_profile',
      description:
        'All KPIs for one airport (traffic, growth, load factor, delays, fares), traffic history since 2019, data periods, and curated structural constraints such as slot controls or caps.',
      schema: airportProfileSchema,
      handler: (input) => services.airports.profile(input.code),
    }),
    defineTool({
      name: 'rank_airports',
      description:
        'Deterministically rank airports on a composite index (expansionOpportunity, congestion or unmetDemand). Returns each score with its per-KPI percentiles, weights, contributions, confidence and caveats. Use it for "best candidates" or "top N" questions.',
      schema: rankAirportsSchema,
      handler: (input) => services.scoring.rank(input),
    }),
    defineTool({
      name: 'compare_airports',
      description:
        'Score 2–8 specific airports side by side on one index (default: congestion), with a full component breakdown.',
      schema: compareAirportsSchema,
      handler: (input) => services.scoring.compare(input),
    }),
    defineTool({
      name: 'get_route_mix',
      description:
        'Long-haul vs short-haul split of departing flights, for passenger, all-cargo and all flights, plus top long-haul routes and international share.',
      schema: routeMixSchema,
      handler: (input) => services.routeMix.get(input),
    }),
    defineTool({
      name: 'get_live_status',
      description:
        'Current FAA NAS status for an airport (ground stops, ground delay programs, closures). Real-time context only; never use it as evidence of structural congestion.',
      schema: airportProfileSchema,
      handler: (input) => services.liveStatus.get(input.code),
    }),
  ];
}

/** JSON Schema of the tool's input shape, without the `$schema` header some providers reject. */
function toParameters(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(schema, { io: 'input' });
  return parameters;
}

export class ToolRegistry {
  private readonly byName: ReadonlyMap<string, Tool>;
  readonly definitions: ChatCompletionFunctionTool[];

  constructor(tools: Tool[]) {
    this.byName = new Map(tools.map((t) => [t.name, t]));
    this.definitions = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: toParameters(t.schema),
      },
    }));
  }

  /**
   * Executes a tool call from the model. Failures are returned to the model as data (not thrown),
   * so it can correct its arguments or explain the problem to the user.
   */
  async execute(name: string, rawArgs: string): Promise<ToolOutcome> {
    const tool = this.byName.get(name);
    if (!tool) return { ok: false, error: `Unknown tool "${name}".` };

    let args: unknown;
    try {
      args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
    } catch {
      return { ok: false, error: 'Tool arguments were not valid JSON.' };
    }

    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, error: `Invalid arguments: ${z.prettifyError(parsed.error)}` };
    }

    try {
      return { ok: true, result: await tool.handler(parsed.data) };
    } catch (err) {
      if (err instanceof AppError) return { ok: false, error: err.message };
      logger.error('Tool failed', { tool: name, error: String(err) });
      return { ok: false, error: 'Internal error while running this tool.' };
    }
  }
}
