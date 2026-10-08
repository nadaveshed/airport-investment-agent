import { errorOf, summarizeResult } from './toolResults';
import type { AssistantMessage, Message, ToolStep } from '../types';

/** A message as the server stores it (OpenAI chat format), from GET /api/chat/:sessionId. */
export interface StoredMessage {
  role: string;
  content?: unknown;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

/**
 * Rebuilds the chat view from stored history so a reload looks like the live conversation:
 * everything between two user messages (preamble text, tool calls, tool results and the final
 * answer) becomes one assistant bubble with its tool trace.
 */
export function restoreMessages(stored: StoredMessage[], newId: () => string): Message[] {
  const view: Message[] = [];
  let turn: AssistantMessage | null = null;

  const currentTurn = () => {
    if (!turn) {
      turn = { id: newId(), role: 'assistant', text: '', status: '', steps: [], done: true };
      view.push(turn);
    }
    return turn;
  };

  for (const m of stored) {
    if (m.role === 'user') {
      if (typeof m.content === 'string' && m.content) {
        view.push({ id: newId(), role: 'user', text: m.content });
      }
      turn = null;
    } else if (m.role === 'assistant') {
      const t = currentTurn();
      if (typeof m.content === 'string' && m.content) {
        // The live stream separates a pre-tool preamble from the answer the same way.
        t.text = t.text ? `${t.text}\n\n${m.content}` : m.content;
      }
      for (const call of m.tool_calls ?? []) {
        t.steps.push({
          id: call.id,
          name: call.function.name,
          args: parseJson(call.function.arguments),
          status: 'running',
          summary: 'no result',
        });
      }
    } else if (m.role === 'tool' && turn) {
      const t: AssistantMessage = turn;
      const index = t.steps.findLastIndex((s) => s.id === m.tool_call_id && s.status === 'running');
      if (index !== -1) t.steps[index] = withResult(t.steps[index]!, parseJson(m.content));
    }
  }

  // Drop turns that ended up empty (e.g. a turn that failed before any text or tool call).
  return view.filter((m) => m.role === 'user' || m.text || m.steps.length > 0);
}

function withResult(step: ToolStep, payload: unknown): ToolStep {
  // Failed tool calls are stored as { error } only.
  const failed =
    typeof payload === 'object' &&
    payload !== null &&
    Object.keys(payload).length === 1 &&
    'error' in payload;
  return failed
    ? { ...step, status: 'error', result: payload, summary: `Error: ${errorOf(payload)}` }
    : { ...step, status: 'ok', result: payload, summary: summarizeResult(payload) };
}

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
