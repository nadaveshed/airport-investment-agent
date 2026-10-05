import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { buildContainer } from '../../src/container.js';
import { LiveStatusService } from '../../src/services/liveStatus.service.js';
import type { Session } from '../../src/types/chat.js';
import { setLogLevel } from '../../src/utils/logger.js';
import { fakeProvider, text, toolCall } from '../agent/fakeLlm.js';

type ErrorBody = { error: { code: string } };

let server: Server;
let base: string;

before(async () => {
  setLogLevel('error');
  const llm = fakeProvider('gemini', [
    [toolCall('c1', 'compare_airports', { codes: ['LAX', 'SNA'] })],
    [text('LAX is more congested.')],
  ]);
  const container = buildContainer(loadEnv({}), {
    providers: [llm.provider],
    liveStatus: new LiveStatusService(async () => '<AIRPORT_STATUS_INFORMATION/>'),
  });
  server = createApp(container).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
});

after(() => server.close());

test('GET /rankings validates and parses query strings', async () => {
  const res = await fetch(`${base}/rankings?region=new%20england&limit=3&includeNonHubs=true`);
  const body = (await res.json()) as { results: unknown[] };
  assert.equal(res.status, 200);
  assert.equal(body.results.length, 3);
});

test('invalid input returns a uniform 400 error body', async () => {
  const res = await fetch(`${base}/compare?codes=LAX`);
  const body = (await res.json()) as ErrorBody;
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('unknown routes return 404 JSON', async () => {
  const res = await fetch(`${base}/does-not-exist`);
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as ErrorBody).error.code, 'NOT_FOUND');
});

test('POST /chat streams session, tool and text events, then stores the turn', async () => {
  const res = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Compare LA and Santa Ana congestion' }),
  });
  assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
  const stream = await res.text();
  const events = [...stream.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
  assert.deepEqual(events, ['session', 'provider', 'tool_call', 'tool_result', 'text', 'done']);

  const sessionId = JSON.parse(stream.match(/event: session\ndata: (.*)/)![1]!).sessionId;
  const history = (await (await fetch(`${base}/chat/${sessionId}`)).json()) as Session;
  assert.deepEqual(
    history.messages.map((m) => m.role),
    ['user', 'assistant', 'tool', 'assistant'],
  );
});
