import path from 'node:path';
import express from 'express';
import type { Container } from './container.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiRouter } from './routes/index.js';

export function createApp(container: Container) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs for rate limiting behind one proxy

  app.use(express.json({ limit: '16kb' }));
  app.use(requestLogger);
  app.use('/api', apiRouter(container));
  app.use('/api', notFound);
  app.use(express.static(path.resolve('dist/web'))); // built React UI (npm run build)
  app.use(errorHandler);

  return app;
}
