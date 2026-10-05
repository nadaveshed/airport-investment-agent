import { rateLimit } from 'express-rate-limit';

/** Chat turns cost LLM tokens, so they are limited per client IP. */
export const chatRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many messages. Please wait a minute and try again.',
      },
    });
  },
});
