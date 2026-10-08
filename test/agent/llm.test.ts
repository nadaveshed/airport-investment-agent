import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProviders } from '../../src/agent/llm.js';
import { loadEnv } from '../../src/config/env.js';

const keys = { GOOGLE_API_KEY: 'g', DEEPSEEK_API_KEY: 'd' };

test('DeepSeek is the default provider, with Gemini as the fallback', () => {
  const providers = createProviders(loadEnv(keys));
  assert.deepEqual(
    providers.map((p) => p.name),
    ['deepseek', 'gemini'],
  );
});

test('LLM_PROVIDER=gemini puts Gemini first', () => {
  const providers = createProviders(loadEnv({ ...keys, LLM_PROVIDER: 'gemini' }));
  assert.equal(providers[0]!.name, 'gemini');
});

test('only Gemini requests ask for low reasoning effort', () => {
  const byName = Object.fromEntries(createProviders(loadEnv(keys)).map((p) => [p.name, p]));
  assert.deepEqual(byName.gemini!.requestOptions, { reasoning_effort: 'low' });
  assert.equal(byName.deepseek!.requestOptions, undefined);
});

test('providers without a key are skipped', () => {
  assert.deepEqual(
    createProviders(loadEnv({ DEEPSEEK_API_KEY: 'd' })).map((p) => p.name),
    ['deepseek'],
  );
});
