import { Router } from 'express';
import { createAirportsController } from '../controllers/airports.controller.js';
import { createChatController } from '../controllers/chat.controller.js';
import { createRankingsController } from '../controllers/rankings.controller.js';
import type { Container } from '../container.js';
import { airportsRoutes } from './airports.routes.js';
import { chatRoutes } from './chat.routes.js';
import { healthRoutes } from './health.routes.js';
import { rankingsRoutes } from './rankings.routes.js';

/** Mounts every API router under /api. */
export function apiRouter(c: Container) {
  return Router()
    .use('/health', healthRoutes(c))
    .use('/chat', chatRoutes(createChatController(c)))
    .use('/airports', airportsRoutes(createAirportsController(c)))
    .use('/', rankingsRoutes(createRankingsController(c.scoring)));
}
