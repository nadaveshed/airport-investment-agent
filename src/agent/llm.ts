import OpenAI from 'openai';
import type { Env } from '../config/env.js';

export type ProviderName = 'gemini' | 'deepseek';

export interface LlmProvider {
  name: ProviderName;
  model: string;
  client: OpenAI;
}

/** Both providers expose OpenAI-compatible endpoints, so one SDK and one agent loop serve both. */
const BASE_URLS: Record<ProviderName, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  deepseek: 'https://api.deepseek.com',
};

/**
 * Returns the configured providers in priority order: the preferred one first, the other
 * as a fallback. Providers without an API key are skipped; an empty list disables chat.
 */
export function createProviders(env: Env): LlmProvider[] {
  const configs: Record<ProviderName, { apiKey?: string; model: string }> = {
    gemini: { apiKey: env.GOOGLE_API_KEY, model: env.GEMINI_MODEL },
    deepseek: { apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL },
  };
  const order: ProviderName[] =
    env.LLM_PROVIDER === 'gemini' ? ['gemini', 'deepseek'] : ['deepseek', 'gemini'];

  return order.flatMap((name) => {
    const { apiKey, model } = configs[name];
    if (!apiKey) return [];
    // Retries are handled by the agent (fallback to the next provider), not inside the SDK.
    const client = new OpenAI({ apiKey, baseURL: BASE_URLS[name], maxRetries: 1, timeout: 60_000 });
    return [{ name, model, client }];
  });
}
