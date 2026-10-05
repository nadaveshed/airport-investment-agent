import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { buildContainer } from './container.js';
import { logger, setLogLevel } from './utils/logger.js';

const env = loadEnv();
setLogLevel(env.LOG_LEVEL);

const container = buildContainer(env);
const server = createApp(container).listen(env.PORT, () => {
  logger.info('Server started', {
    url: `http://localhost:${env.PORT}`,
    airports: container.repo.all().length,
    chatEnabled: container.agent.isConfigured,
    llmProvider: env.LLM_PROVIDER,
  });
  if (!container.agent.isConfigured) {
    logger.warn('No LLM API key set: REST endpoints work, chat is disabled. See .env.example.');
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info('Shutting down', { signal });
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
