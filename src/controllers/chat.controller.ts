import type { Request, Response } from 'express';
import type { Agent } from '../agent/agent.js';
import type { ChatRequest } from '../schemas/chat.schema.js';
import type { ChatService } from '../services/chat.service.js';
import { AppError, ServiceUnavailableError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { openSse } from '../utils/sse.js';

export function createChatController(deps: { chat: ChatService; agent: Agent }) {
  return {
    /** Streams one agent turn as Server-Sent Events: session → provider/tool_call/tool_result/text… → done | error. */
    async send(req: Request, res: Response) {
      if (!deps.agent.isConfigured) {
        throw new ServiceUnavailableError(
          'Chat is disabled: no LLM API key is configured on the server.',
        );
      }
      const body = req.validated.body as ChatRequest;
      const session = deps.chat.openSession(body.sessionId);
      const sse = openSse(res);

      // Stop the agent (and token spend) if the client goes away mid-answer.
      const abort = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) abort.abort();
      });

      sse.send('session', { sessionId: session.id });
      try {
        await deps.chat.send(session, body, {
          signal: abort.signal,
          onEvent: (event) => sse.send(event.type, event),
        });
        sse.send('done', {});
      } catch (err) {
        if (abort.signal.aborted) return;
        logger.error('Chat turn failed', { sessionId: session.id, error: String(err) });
        sse.send('error', {
          message:
            err instanceof AppError ? err.message : 'Something went wrong. Please try again.',
        });
      } finally {
        sse.end();
      }
    },

    history(req: Request, res: Response) {
      const { sessionId } = req.validated.params as { sessionId: string };
      res.json(deps.chat.history(sessionId));
    },
  };
}
