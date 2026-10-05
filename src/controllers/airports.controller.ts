import type { Request, Response } from 'express';
import type {
  AirportProfileInput,
  RouteMixInput,
  SearchAirportsInput,
} from '../schemas/airport.schema.js';
import type { AirportService } from '../services/airport.service.js';
import type { LiveStatusService } from '../services/liveStatus.service.js';
import type { RouteMixService } from '../services/routeMix.service.js';

export function createAirportsController(deps: {
  airports: AirportService;
  routeMix: RouteMixService;
  liveStatus: LiveStatusService;
}) {
  return {
    search(req: Request, res: Response) {
      res.json(deps.airports.search(req.validated.query as SearchAirportsInput));
    },

    profile(req: Request, res: Response) {
      const { code } = req.validated.params as AirportProfileInput;
      res.json(deps.airports.profile(code));
    },

    routeMix(req: Request, res: Response) {
      const { code } = req.validated.params as AirportProfileInput;
      const query = req.validated.query as Omit<RouteMixInput, 'code'>;
      res.json(deps.routeMix.get({ code, ...query }));
    },

    async liveStatus(req: Request, res: Response) {
      const { code } = req.validated.params as AirportProfileInput;
      res.json(await deps.liveStatus.get(code));
    },
  };
}
