import { computeRouteMix } from '../domain/routeMix.js';
import type { AirportRepository } from '../repositories/airport.repository.js';
import type { RouteMixInput } from '../schemas/airport.schema.js';
import type { AirportService } from './airport.service.js';

export class RouteMixService {
  constructor(
    private readonly airports: AirportService,
    private readonly repo: AirportRepository,
  ) {}

  get(input: RouteMixInput) {
    const airport = this.airports.requireAirport(input.code);
    const mix = computeRouteMix(this.repo.routesFrom(airport.code), input.longHaulMiles);

    const notes = [
      'Shares are by departing flights (segments); seat share is also given for passenger flights.',
      'Flights with intermediate stops count as separate segments, as reported in BTS T-100.',
    ];
    if (mix.cargo.departures > mix.passenger.departures) {
      notes.push(
        'All-cargo flights outnumber passenger flights here, so the passenger and all-flight long-haul shares differ a lot. Say which one you mean.',
      );
    }

    return {
      airport: { code: airport.code, name: airport.name, hubSize: airport.hubSize },
      year: this.repo.info().latestYear,
      definition: `Long-haul = route distance ≥ ${input.longHaulMiles.toLocaleString('en-US')} statute miles`,
      mix,
      notes,
    };
  }
}
