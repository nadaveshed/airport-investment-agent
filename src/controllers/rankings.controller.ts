import type { Request, Response } from 'express';
import type { CompareAirportsInput, RankAirportsInput } from '../schemas/airport.schema.js';
import type { ScoringService } from '../services/scoring.service.js';

export function createRankingsController(scoring: ScoringService) {
  return {
    rank(req: Request, res: Response) {
      res.json(scoring.rank(req.validated.query as RankAirportsInput));
    },

    compare(req: Request, res: Response) {
      res.json(scoring.compare(req.validated.query as CompareAirportsInput));
    },
  };
}
