import type { ChatMessage } from '../types/chat.js';

const OMITTED = JSON.stringify({
  note: 'Earlier tool result omitted to save context. Call the tool again if you need it.',
});

const size = (m: ChatMessage) =>
  (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content ?? '').length) +
  ('tool_calls' in m && m.tool_calls ? JSON.stringify(m.tool_calls).length : 0);

/**
 * Keeps long conversations within budget by blanking the oldest tool results first.
 * User and assistant messages are always kept, so the model still knows what was asked and answered.
 */
export function compactHistory(messages: readonly ChatMessage[], maxChars: number): ChatMessage[] {
  let total = messages.reduce((sum, m) => sum + size(m), 0);
  if (total <= maxChars) return [...messages];

  return messages.map((m) => {
    if (total <= maxChars || m.role !== 'tool' || m.content === OMITTED) return m;
    total -= size(m) - OMITTED.length;
    return { ...m, content: OMITTED };
  });
}
