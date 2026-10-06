import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/** Conversation history is stored in the OpenAI chat format, which both Gemini and DeepSeek accept. */
export type ChatMessage = ChatCompletionMessageParam;

export interface Session {
  id: string;
  /** Full history except the system prompt, including assistant tool calls and tool results. */
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

/** Events streamed to the client while the agent works on a turn. */
export type AgentEvent =
  | { type: 'provider'; provider: string; model: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; result: unknown }
  | { type: 'text'; delta: string }
  /** Remove only the failed completion's text, keeping earlier successful rounds. */
  | { type: 'text_reset'; removeChars: number };
