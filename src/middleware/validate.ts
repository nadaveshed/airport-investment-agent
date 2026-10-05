import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Parsed, typed request parts. Express 5 makes `req.query` read-only, so results live here. */
    validated: { body?: unknown; query?: unknown; params?: unknown };
  }
}

/** Validates request parts against zod schemas. A ZodError reaches the error handler as a 400. */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.validated = {
      body: schemas.body?.parse(req.body),
      query: schemas.query?.parse(req.query),
      params: schemas.params?.parse(req.params),
    };
    next();
  };
}
