import { Router } from 'express';
import type { createAirportsController } from '../controllers/airports.controller.js';
import { validate } from '../middleware/validate.js';
import {
  airportProfileSchema,
  routeMixQuery,
  searchAirportsQuery,
} from '../schemas/airport.schema.js';

export function airportsRoutes(controller: ReturnType<typeof createAirportsController>) {
  return Router()
    .get('/', validate({ query: searchAirportsQuery }), controller.search)
    .get('/:code', validate({ params: airportProfileSchema }), controller.profile)
    .get(
      '/:code/route-mix',
      validate({ params: airportProfileSchema, query: routeMixQuery }),
      controller.routeMix,
    )
    .get('/:code/live-status', validate({ params: airportProfileSchema }), controller.liveStatus);
}
