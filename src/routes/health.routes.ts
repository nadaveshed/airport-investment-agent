import { Router } from 'express';
import type { Agent } from '../agent/agent.js';
import type { AirportRepository } from '../repositories/airport.repository.js';

export function healthRoutes(deps: { repo: AirportRepository; agent: Agent }) {
  return Router().get('/', (_req, res) => {
    const { generatedAt, latestYear, sources } = deps.repo.info();
    res.json({
      status: 'ok',
      chatEnabled: deps.agent.isConfigured,
      data: { generatedAt, latestYear, airports: deps.repo.all().length, sources },
    });
  });
}
