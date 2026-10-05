import { computeRouteMix } from '../domain/routeMix.js';
import type { AirportRepository } from '../repositories/airport.repository.js';
import type { RouteInput, RouteMixInput } from '../schemas/airport.schema.js';
import type { RouteSegment } from '../types/airport.js';
import { NotFoundError } from '../utils/errors.js';
import type { AirportService } from './airport.service.js';

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

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

  /**
   * Traffic on one airport pair, in both directions where the data has them. The snapshot holds
   * departures from tracked US airports only, so a foreign origin (e.g. TLV→JFK) is answered with
   * the US-departure direction and an explicit note.
   */
  route(input: RouteInput) {
    const { from, to } = input;
    const fromUs = this.repo.get(from);
    const toUs = this.repo.get(to);
    if (!fromUs && !toUs) {
      throw new NotFoundError(
        `Neither ${from} nor ${to} is a tracked US airport. Route data only covers flights departing tracked US airports.`,
      );
    }
    const find = (origin: string, dest: string) =>
      this.repo.routesFrom(origin).find((r) => r.dest === dest);
    const year = this.repo.info().latestYear;

    const directions = [
      { origin: from, dest: to, covered: Boolean(fromUs), segment: fromUs && find(from, to) },
      { origin: to, dest: from, covered: Boolean(toUs), segment: toUs && find(to, from) },
    ].map(({ origin, dest, covered, segment }) => ({
      origin,
      dest,
      ...(segment
        ? describeSegment(segment)
        : {
            status: covered
              ? `No departures reported in ${year}`
              : `Not in the dataset: ${origin} is not a tracked US airport`,
          }),
    }));

    const notes = [
      `BTS T-100 segment data, calendar year ${year}: nonstop flight legs operated, all carriers.`,
    ];
    if (!fromUs || !toUs) {
      notes.push(
        'Only departures from US airports are in the dataset, so flights into the US from abroad are missing. The US-departure direction is a reasonable proxy for the reverse, since scheduled routes usually operate as round trips. Say this when you use it.',
      );
    }

    const foreign = !toUs ? to : !fromUs ? from : undefined;
    return {
      year,
      directions,
      // Other US gateways to the same foreign airport give context for "how does X compare".
      ...(foreign ? { usGatewaysToForeignAirport: this.gatewaysTo(foreign) } : {}),
      notes,
    };
  }

  private gatewaysTo(dest: string) {
    return this.repo
      .all()
      .flatMap((a) => this.repo.routesFrom(a.code).filter((r) => r.dest === dest))
      .filter((r) => r.passengers > 0)
      .sort((a, b) => b.passengers - a.passengers)
      .slice(0, 8)
      .map((r) => ({
        origin: r.origin,
        passengerDepartures: integer.format(r.passengerDepartures),
        passengers: integer.format(r.passengers),
      }));
  }
}

function describeSegment(r: RouteSegment) {
  return {
    destName: r.destName,
    distance: `${integer.format(r.distanceMiles)} mi`,
    passengerDepartures: integer.format(r.passengerDepartures),
    passengerDeparturesPerWeek: (r.passengerDepartures / 52).toFixed(1),
    cargoDepartures: integer.format(r.cargoDepartures),
    seats: integer.format(r.seats),
    passengers: integer.format(r.passengers),
    loadFactor: r.seats > 0 ? `${((r.passengers / r.seats) * 100).toFixed(1)}%` : 'n/a',
    freight: `${integer.format(r.freightLbs)} lbs`,
  };
}
