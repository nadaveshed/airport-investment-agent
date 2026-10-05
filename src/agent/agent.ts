import OpenAI from 'openai';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';
import type { AgentEvent, ChatMessage } from '../types/chat.js';
import { ServiceUnavailableError, UpstreamError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { compactHistory } from './context.js';
import type { LlmProvider } from './llm.js';
import type { ToolRegistry } from './tools.js';

export interface AgentOptions {
  /** Upper bound on tool-calling rounds per user turn; afterwards the model must answer. */
  maxToolRounds: number;
  /** Rough context budget for the history sent to the model (characters). */
  maxHistoryChars: number;
}

export interface RunOptions {
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}

type ToolCall = ChatCompletionMessageFunctionToolCall & { extra_content?: unknown };

const DEFAULTS: AgentOptions = { maxToolRounds: 6, maxHistoryChars: 120_000 };

/**
 * Tool-calling loop: the model plans (chooses tools), the tools compute, and the model narrates.
 * The whole conversation, including earlier tool results, is sent on every turn, which is
 * what makes follow-up questions work.
 */
export class Agent {
  private readonly options: AgentOptions;

  constructor(
    private readonly providers: LlmProvider[],
    private readonly tools: ToolRegistry,
    private readonly systemPrompt: string,
    options: Partial<AgentOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  get isConfigured(): boolean {
    return this.providers.length > 0;
  }

  /** Runs one user turn. Returns the messages it added (assistant and tool), to be stored in the session. */
  async run(
    history: readonly ChatMessage[],
    { signal, onEvent }: RunOptions = {},
  ): Promise<ChatMessage[]> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableError(
        'No LLM provider is configured. Set GOOGLE_API_KEY or DEEPSEEK_API_KEY.',
      );
    }
    const added: ChatMessage[] = [];
    let provider: LlmProvider | undefined;

    for (let round = 0; ; round++) {
      const messages: ChatMessage[] = [
        { role: 'system', content: this.systemPrompt },
        ...compactHistory([...history, ...added], this.options.maxHistoryChars),
      ];
      const forceAnswer = round >= this.options.maxToolRounds;
      const result = await this.complete(messages, forceAnswer, provider, signal, onEvent);
      provider = result.provider; // stay on one provider within a turn
      added.push(result.message);

      const calls = result.message.tool_calls ?? [];
      if (calls.length === 0) return added;

      for (const call of calls as ToolCall[]) {
        onEvent?.({
          type: 'tool_call',
          id: call.id,
          name: call.function.name,
          args: safeJson(call.function.arguments),
        });
        const outcome = await this.tools.execute(call.function.name, call.function.arguments);
        const payload = outcome.ok ? outcome.result : { error: outcome.error };
        onEvent?.({
          type: 'tool_result',
          id: call.id,
          name: call.function.name,
          ok: outcome.ok,
          result: payload,
        });
        added.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(payload) });
      }
    }
  }

  /** Streams one completion. Falls back to the next provider on rate limits, 5xx and network errors. */
  private async complete(
    messages: ChatMessage[],
    forceAnswer: boolean,
    pinned: LlmProvider | undefined,
    signal: AbortSignal | undefined,
    onEvent: RunOptions['onEvent'],
  ): Promise<{ provider: LlmProvider; message: ChatCompletionAssistantMessageParam }> {
    const candidates = pinned ? [pinned] : this.providers;
    let lastError: unknown;

    for (const provider of candidates) {
      try {
        const stream = await provider.client.chat.completions.create(
          {
            model: provider.model,
            messages,
            tools: this.tools.definitions,
            tool_choice: forceAnswer ? 'none' : 'auto',
            stream: true,
          },
          { signal },
        );
        if (!pinned)
          onEvent?.({ type: 'provider', provider: provider.name, model: provider.model });
        return { provider, message: await accumulate(stream, onEvent) };
      } catch (err) {
        if (signal?.aborted || !isRetryable(err)) throw toAppError(err);
        logger.warn('LLM provider failed, trying fallback', {
          provider: provider.name,
          error: String(err),
        });
        lastError = err;
      }
    }
    throw toAppError(lastError);
  }
}

/** Rebuilds a full assistant message (text and tool calls) from streamed deltas. */
async function accumulate(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  onEvent: RunOptions['onEvent'],
): Promise<ChatCompletionAssistantMessageParam> {
  let content = '';
  const calls: ToolCall[] = [];

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;
    if (delta.content) {
      content += delta.content;
      onEvent?.({ type: 'text', delta: delta.content });
    }
    for (const part of delta.tool_calls ?? []) {
      // OpenAI streams one call in fragments keyed by `index`; Gemini may send whole calls without one.
      const existing = part.index !== undefined ? calls[part.index] : undefined;
      let call = existing;
      if (!call || (part.id && call.id !== part.id)) {
        call = {
          id: part.id ?? `call_${calls.length}`,
          type: 'function',
          function: { name: '', arguments: '' },
        };
        if (part.index !== undefined && !existing) calls[part.index] = call;
        else calls.push(call);
      }
      if (part.id) call.id = part.id;
      call.function.name += part.function?.name ?? '';
      call.function.arguments += part.function?.arguments ?? '';
      // Gemini thought signatures must be echoed back on the next request.
      const extra = (part as { extra_content?: unknown }).extra_content;
      if (extra) call.extra_content = extra;
    }
  }

  const toolCalls = calls.filter(Boolean);
  return {
    role: 'assistant',
    content: content || null,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
  };
}

function isRetryable(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionError) return true;
  return err instanceof OpenAI.APIError && (err.status === 429 || (err.status ?? 0) >= 500);
}

function toAppError(err: unknown): Error {
  if (err instanceof OpenAI.APIError) {
    return new UpstreamError(
      `The language model request failed (${err.status ?? 'network'}). Please try again.`,
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
