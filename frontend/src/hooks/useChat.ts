import { useCallback, useEffect, useRef, useState } from 'react';
import { readSse } from '../lib/sse';
import { loadSessionId, saveSessionId } from '../lib/storage';
import { errorOf, summarizeResult } from '../lib/toolResults';
import type { AssistantMessage, Message, ServerEvent } from '../types';

let nextId = 0;
const newId = () => String(++nextId);

type StoredMessage = { role: string; content?: unknown };

/** Owns the conversation: sends questions, applies streamed events, and restores the session after a reload. */
export function useChat(onAnswer: (markdown: string) => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const sessionId = useRef(loadSessionId());

  const setSession = (id: string | null) => {
    sessionId.current = id;
    saveSessionId(id);
  };

  // Restore the visible conversation (tool calls are not re-rendered).
  useEffect(() => {
    const id = sessionId.current;
    if (!id) return;
    let cancelled = false;
    fetch(`/api/chat/${id}`)
      .then(async (res) => {
        if (!res.ok) return setSession(null);
        const session = (await res.json()) as { messages: StoredMessage[] };
        if (!cancelled) setMessages(session.messages.flatMap(restore));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const ask = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (busy || !message) return;
      setBusy(true);

      const id = newId();
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'user', text: message },
        { id, role: 'assistant', text: '', status: 'Thinking…', steps: [], done: false },
      ]);
      const update = (fn: (m: AssistantMessage) => AssistantMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === id && m.role === 'assistant' ? fn(m) : m)));

      let answer = '';
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            sessionId.current ? { sessionId: sessionId.current, message } : { message },
          ),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? `Request failed (${res.status})`);
        }
        await readSse(res, (event) => {
          if (event.type === 'session') setSession(event.sessionId);
          if (event.type === 'text') answer += event.delta;
          if (event.type === 'text_reset') answer = answer.slice(0, -event.removeChars);
          update((m) => apply(m, event));
        });
        if (answer) onAnswer(answer);
      } catch (err) {
        update((m) => ({ ...m, error: err instanceof Error ? err.message : String(err) }));
      } finally {
        update((m) => ({ ...m, done: true, status: '' }));
        setBusy(false);
      }
    },
    [busy, onAnswer],
  );

  const reset = useCallback(() => {
    setSession(null);
    setMessages([]);
  }, []);

  return { messages, busy, ask, reset };
}

function apply(m: AssistantMessage, event: ServerEvent): AssistantMessage {
  switch (event.type) {
    case 'provider':
      return { ...m, model: event.model };
    case 'tool_call':
      return {
        ...m,
        status: `Running ${event.name}…`,
        steps: [
          ...m.steps,
          {
            id: event.id,
            name: event.name,
            args: event.args,
            status: 'running',
            summary: 'running…',
          },
        ],
      };
    case 'tool_result': {
      // Some providers reuse call ids across rounds, so match the latest call still running.
      const index = m.steps.findLastIndex((s) => s.id === event.id && s.status === 'running');
      const steps = m.steps.map((s, i) =>
        i === index
          ? {
              ...s,
              status: event.ok ? ('ok' as const) : ('error' as const),
              result: event.result,
              summary: event.ok ? summarizeResult(event.result) : `Error: ${errorOf(event.result)}`,
            }
          : s,
      );
      return { ...m, status: 'Writing answer…', steps };
    }
    case 'text':
      return { ...m, text: m.text + event.delta };
    case 'text_reset':
      return { ...m, text: m.text.slice(0, -event.removeChars) };
    case 'done':
      return { ...m, done: true, status: '' };
    case 'error':
      return { ...m, done: true, status: '', error: event.message };
    default:
      return m;
  }
}

function restore(m: StoredMessage): Message[] {
  if (typeof m.content !== 'string' || !m.content) return [];
  if (m.role === 'user') return [{ id: newId(), role: 'user', text: m.content }];
  if (m.role === 'assistant') {
    return [{ id: newId(), role: 'assistant', text: m.content, status: '', steps: [], done: true }];
  }
  return [];
}
