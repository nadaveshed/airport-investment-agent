import type { Response } from 'express';

export interface SseStream {
  send(event: string, data: unknown): void;
  end(): void;
}

/** Opens a Server-Sent Events stream on a response. Used for POST, so the client reads it with fetch. */
export function openSse(res: Response): SseStream {
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  return {
    send(event, data) {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      if (!res.writableEnded) res.end();
    },
  };
}
