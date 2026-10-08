import { z } from 'zod';

const optionalKey = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LLM_PROVIDER: z.enum(['gemini', 'deepseek']).default('deepseek'),
  GOOGLE_API_KEY: optionalKey,
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  DEEPSEEK_API_KEY: optionalKey,
  DEEPSEEK_MODEL: z.string().default('deepseek-flash'),
  SNAPSHOT_PATH: z.string().default('data/snapshot.json'),
  CONSTRAINTS_PATH: z.string().default('data/airportConstraints.json'),
});

export type Env = z.infer<typeof envSchema>;

/** Validates process.env once at startup and fails fast with a readable message. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // GEMINI_API_KEY is the name Google AI Studio suggests; accept it as an alias.
  const parsed = envSchema.safeParse({
    ...source,
    GOOGLE_API_KEY: source.GOOGLE_API_KEY || source.GEMINI_API_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
