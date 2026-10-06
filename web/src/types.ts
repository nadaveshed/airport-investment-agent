import type { AgentEvent } from '../../src/types/chat';

/** Everything the server can send on the chat SSE stream. */
export type ServerEvent =
  | { type: 'session'; sessionId: string }
  | AgentEvent
  | { type: 'done' }
  | { type: 'error'; message: string };

export type Confidence = 'low' | 'medium' | 'high';

export interface ToolStep {
  id: string;
  name: string;
  args: unknown;
  status: 'running' | 'ok' | 'error';
  summary: string;
  result?: unknown;
}

export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
}

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  text: string;
  /** Progress line shown while the answer is being produced ("Running rank_airports…"). */
  status: string;
  model?: string;
  steps: ToolStep[];
  done: boolean;
  error?: string;
}

export type Message = UserMessage | AssistantMessage;

export interface Health {
  chatEnabled: boolean;
  data: {
    airports: number;
    latestYear: number;
    sources: { id: string; period: string }[];
  };
}
