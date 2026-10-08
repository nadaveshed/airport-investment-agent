import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreMessages, type StoredMessage } from './history';
import type { AssistantMessage } from '../types';

const ids = () => {
  let n = 0;
  return () => String(++n);
};

const call = (id: string, name: string, args: object) => ({
  id,
  function: { name, arguments: JSON.stringify(args) },
});

const rankResult = {
  results: [
    { selectionRank: 1, code: 'BOS', score: 69.4, confidence: 'high' },
    { selectionRank: 2, code: 'PWM', score: 65.2, confidence: 'high' },
  ],
};

test('a turn with a preamble, a tool call and an answer restores as one bubble with its trace', () => {
  const stored: StoredMessage[] = [
    { role: 'user', content: 'Rank New England' },
    {
      role: 'assistant',
      content: "I'll rank New England airports.",
      tool_calls: [call('c1', 'rank_airports', { region: 'new england' })],
    },
    { role: 'tool', tool_call_id: 'c1', content: JSON.stringify(rankResult) },
    { role: 'assistant', content: 'BOS ranks first.' },
  ];

  const view = restoreMessages(stored, ids());
  assert.deepEqual(
    view.map((m) => m.role),
    ['user', 'assistant'],
  );
  const answer = view[1] as AssistantMessage;
  assert.equal(answer.text, "I'll rank New England airports.\n\nBOS ranks first.");
  assert.equal(answer.done, true);
  assert.equal(answer.steps.length, 1);
  assert.equal(answer.steps[0]!.status, 'ok');
  assert.deepEqual(answer.steps[0]!.args, { region: 'new england' });
  assert.equal(answer.steps[0]!.summary, '1. BOS 69.4 (high) · 2. PWM 65.2 (high)');
});

test('failed tool calls are restored as errors', () => {
  const view = restoreMessages(
    [
      { role: 'user', content: 'Profile XXX' },
      { role: 'assistant', content: null, tool_calls: [call('c1', 'get_airport_profile', {})] },
      { role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ error: 'Unknown airport' }) },
      { role: 'assistant', content: 'That code is not a tracked airport.' },
    ],
    ids(),
  );
  const step = (view[1] as AssistantMessage).steps[0]!;
  assert.equal(step.status, 'error');
  assert.equal(step.summary, 'Error: Unknown airport');
});

test('each user question starts a new assistant bubble', () => {
  const view = restoreMessages(
    [
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'A2' },
    ],
    ids(),
  );
  assert.deepEqual(
    view.map((m) => m.text),
    ['Q1', 'A1', 'Q2', 'A2'],
  );
});

test('a call id reused in a later round is matched to its own result', () => {
  const view = restoreMessages(
    [
      { role: 'user', content: 'Compare' },
      { role: 'assistant', content: null, tool_calls: [call('call_0', 'rank_airports', {})] },
      { role: 'tool', tool_call_id: 'call_0', content: JSON.stringify(rankResult) },
      { role: 'assistant', content: null, tool_calls: [call('call_0', 'get_live_status', {})] },
      { role: 'tool', tool_call_id: 'call_0', content: JSON.stringify({ summary: 'No delays' }) },
      { role: 'assistant', content: 'Done.' },
    ],
    ids(),
  );
  const steps = (view[1] as AssistantMessage).steps;
  assert.deepEqual(
    steps.map((s) => s.summary),
    ['1. BOS 69.4 (high) · 2. PWM 65.2 (high)', 'No delays'],
  );
});
