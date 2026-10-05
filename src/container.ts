import { Agent } from './agent/agent.js';
import { createProviders } from './agent/llm.js';
import { buildSystemPrompt } from './agent/prompt.js';
import { createTools, ToolRegistry } from './agent/tools.js';
import type { Env } from './config/env.js';
import type { AirportRepository } from './repositories/airport.repository.js';
import { JsonSnapshotRepository } from './repositories/jsonSnapshot.repository.js';
import { InMemorySessionRepository } from './repositories/session.repository.js';
import { AirportService } from './services/airport.service.js';
import { ChatService } from './services/chat.service.js';
import { LiveStatusService } from './services/liveStatus.service.js';
import { RouteMixService } from './services/routeMix.service.js';
import { ScoringService } from './services/scoring.service.js';
import type { LlmProvider } from './agent/llm.js';

/** Composition root: the only place that knows concrete implementations. */
export function buildContainer(
  env: Env,
  overrides: {
    repo?: AirportRepository;
    providers?: LlmProvider[];
    liveStatus?: LiveStatusService;
  } = {},
) {
  const repo =
    overrides.repo ?? JsonSnapshotRepository.fromFiles(env.SNAPSHOT_PATH, env.CONSTRAINTS_PATH);
  const airports = new AirportService(repo);
  const scoring = new ScoringService(airports, repo);
  const routeMix = new RouteMixService(airports, repo);
  const liveStatus = overrides.liveStatus ?? new LiveStatusService();

  const tools = new ToolRegistry(createTools({ airports, scoring, routeMix, liveStatus }));
  const agent = new Agent(
    overrides.providers ?? createProviders(env),
    tools,
    buildSystemPrompt(repo.info()),
  );
  const chat = new ChatService(agent, new InMemorySessionRepository());

  return { repo, airports, scoring, routeMix, liveStatus, tools, agent, chat };
}

export type Container = ReturnType<typeof buildContainer>;
