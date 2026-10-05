import { Router } from 'express';
import type { createRankingsController } from '../controllers/rankings.controller.js';
import { validate } from '../middleware/validate.js';
import { compareAirportsQuery, rankAirportsQuery } from '../schemas/airport.schema.js';

export function rankingsRoutes(controller: ReturnType<typeof createRankingsController>) {
  return Router()
    .get('/rankings', validate({ query: rankAirportsQuery }), controller.rank)
    .get('/compare', validate({ query: compareAirportsQuery }), controller.compare);
}
