import type { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Maps every error to one response shape. Unexpected errors are logged and never leak internals. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response<ErrorBody>,
  _next: NextFunction,
) {
  if (res.headersSent) {
    logger.error('Error after response started', { path: req.path, error: String(err) });
    res.end();
    return;
  }

  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: z.prettifyError(err), details: err.issues },
    });
    return;
  }

  // body-parser errors (malformed JSON, payload too large) carry an HTTP status.
  const status = (err as { status?: number })?.status;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: { code: 'BAD_REQUEST', message: (err as Error).message } });
    return;
  }

  logger.error('Unhandled error', {
    path: req.path,
    error: err instanceof Error ? err.stack : String(err),
  });
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
}
