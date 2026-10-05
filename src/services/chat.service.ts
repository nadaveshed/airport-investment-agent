import type { Agent, RunOptions } from '../agent/agent.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import type { ChatRequest } from '../schemas/chat.schema.js';
import type { Session } from '../types/chat.js';
import { NotFoundError } from '../utils/errors.js';

export class ChatService {
  constructor(
    private readonly agent: Agent,
    private readonly sessions: SessionRepository,
  ) {}

  /** Starts or resumes a session. Unknown or expired IDs start a new session instead of failing. */
  openSession(sessionId?: string): Session {
    return (sessionId && this.sessions.get(sessionId)) || this.sessions.create();
  }

  /**
   * Runs one turn against the full stored history. The session is saved only when the turn
   * completes, so an aborted or failed turn leaves no half-finished tool calls behind.
   */
  async send(session: Session, request: ChatRequest, options: RunOptions): Promise<void> {
    const userMessage = { role: 'user' as const, content: request.message };
    const added = await this.agent.run([...session.messages, userMessage], options);
    this.sessions.save({ ...session, messages: [...session.messages, userMessage, ...added] });
  }

  history(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundError('Session not found or expired.');
    return session;
  }
}
