/** Base class for expected, user-facing errors. Anything else is treated as an internal error. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class UpstreamError extends AppError {
  constructor(message: string) {
    super(message, 502, 'UPSTREAM_ERROR');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string) {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}
