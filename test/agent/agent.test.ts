import { test } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { Agent } from '../../src/agent/agent.js';
import { ToolRegistry } from '../../src/agent/tools.js';
import { InMemorySessionRepository } from '../../src/repositories/session.repository.js';
import { ChatService } from '../../src/services/chat.service.js';
import type { AgentEvent } from '../../src/types/chat.js';
import { z } from 'zod';
import { fakeProvider, text, toolCall } from './fakeLlm.js';

const echoTool = new ToolRegistry([
  {
    name: 'rank_airports',
    description: 'test tool',
    schema: z.object({ region: z.string() }),
    handler: (input: unknown) => ({ ranked: ['BOS', 'BDL'], input }),
  },
]);

const rateLimited = () => new OpenAI.RateLimitError(429, undefined, 'rate limited', new Headers());

test('runs tools and feeds results back before answering', async () => {
  const { provider, requests } = fakeProvider('gemini', [
    [toolCall('c1', 'rank_airports', { region: 'new england' })],
    [text('BOS ranks first.')],
  ]);
  const events: AgentEvent[] = [];
  const added = await new Agent([provider], echoTool, 'system').run(
    [{ role: 'user', content: 'Rank New England' }],
    { onEvent: (e) => events.push(e) },
  );

  assert.deepEqual(
    added.map((m) => m.role),
    ['assistant', 'tool', 'assistant'],
  );
  const toolMessage = requests[1]!.messages.find((m) => m.role === 'tool');
  assert.deepEqual(JSON.parse(toolMessage!.content as string).ranked, ['BOS', 'BDL']);
  assert.deepEqual(
    events.map((e) => e.type),
    ['provider', 'tool_call', 'tool_result', 'text'],
  );
});

test('follow-up turns send the whole conversation, including earlier tool results', async () => {
  const { provider, requests } = fakeProvider('gemini', [
    [toolCall('c1', 'rank_airports', { region: 'new england' })],
    [text('1. BOS 2. BDL')],
    [text('BDL is second because…')],
  ]);
  const chat = new ChatService(
    new Agent([provider], echoTool, 'system'),
    new InMemorySessionRepository(),
  );

  const session = chat.openSession();
  await chat.send(session, { message: 'Rank New England airports' }, {});
  const resumed = chat.openSession(session.id);
  await chat.send(resumed, { message: 'Why is the second one lower?' }, {});

  const sent = requests[2]!.messages;
  assert.equal(sent[0]!.role, 'system');
  assert.deepEqual(
    sent.slice(1).map((m) => m.role),
    ['user', 'assistant', 'tool', 'assistant', 'user'],
  );
  const earlierResult = sent.find((m) => m.role === 'tool')!.content as string;
  assert.deepEqual(JSON.parse(earlierResult).ranked, ['BOS', 'BDL']); // visible to the model
  assert.equal(chat.history(session.id).messages.length, 6);
});

test('invalid tool arguments are returned to the model instead of failing the turn', async () => {
  const { provider, requests } = fakeProvider('gemini', [
    [toolCall('c1', 'rank_airports', { region: 42 })],
    [text('Sorry, let me fix that.')],
  ]);
  await new Agent([provider], echoTool, 'system').run([{ role: 'user', content: 'x' }]);
  const toolMessage = requests[1]!.messages.find((m) => m.role === 'tool');
  assert.match(toolMessage!.content as string, /Invalid arguments/);
});

test('falls back to the next provider on rate limits', async () => {
  const primary = fakeProvider('gemini', [rateLimited()]);
  const fallback = fakeProvider('deepseek', [[text('answer from fallback')]]);
  const events: AgentEvent[] = [];
  const added = await new Agent([primary.provider, fallback.provider], echoTool, 'system').run(
    [{ role: 'user', content: 'x' }],
    { onEvent: (e) => events.push(e) },
  );
  assert.equal(added[0]!.content, 'answer from fallback');
  assert.deepEqual(events[0], { type: 'provider', provider: 'deepseek', model: 'deepseek-fake' });
});

test('forces a final answer after the tool-round limit', async () => {
  const { provider, requests } = fakeProvider('gemini', [
    [toolCall('c1', 'rank_airports', { region: 'a' })],
    [toolCall('c2', 'rank_airports', { region: 'b' })],
    [text('done')],
  ]);
  await new Agent([provider], echoTool, 'system', { maxToolRounds: 2 }).run([
    { role: 'user', content: 'x' },
  ]);
  assert.deepEqual(
    requests.map((r) => r.tool_choice),
    ['auto', 'auto', 'none'],
  );
});

test('a failed turn does not store a partial conversation', async () => {
  const { provider } = fakeProvider('gemini', [new Error('boom')]);
  const chat = new ChatService(
    new Agent([provider], echoTool, 'system'),
    new InMemorySessionRepository(),
  );
  const session = chat.openSession();
  await assert.rejects(chat.send(session, { message: 'hi' }, {}));
  assert.equal(chat.history(session.id).messages.length, 0);
});
