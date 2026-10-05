import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactHistory } from '../../src/agent/context.js';
import type { ChatMessage } from '../../src/types/chat.js';

const big = 'x'.repeat(1000);
const history: ChatMessage[] = [
  { role: 'user', content: 'q1' },
  { role: 'tool', tool_call_id: 'a', content: big },
  { role: 'assistant', content: 'a1' },
  { role: 'user', content: 'q2' },
  { role: 'tool', tool_call_id: 'b', content: big },
];

test('keeps history unchanged when within budget', () => {
  assert.deepEqual(compactHistory(history, 10_000), history);
});

test('blanks the oldest tool results first and keeps user/assistant messages', () => {
  const compacted = compactHistory(history, 1500);
  assert.notEqual(compacted[1]!.content, big);
  assert.equal(compacted[4]!.content, big);
  assert.deepEqual(
    compacted.filter((m) => m.role !== 'tool'),
    history.filter((m) => m.role !== 'tool'),
  );
});
