const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

let threshold: number = LEVELS.info;

export function setLogLevel(level: LogLevel) {
  threshold = LEVELS[level];
}

/** Minimal structured (JSON-lines) logger; swap for pino if this ever runs in production. */
function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...context });
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
};
