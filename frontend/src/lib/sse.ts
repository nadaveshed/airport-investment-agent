import type { ServerEvent } from '../types';

/** Reads a fetch() response body as Server-Sent Events (the chat endpoint is a POST, so EventSource can't be used). */
export async function readSse(response: Response, onEvent: (event: ServerEvent) => void) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const name = /^event: (.*)$/m.exec(frame)?.[1];
      const data = /^data: (.*)$/m.exec(frame)?.[1];
      if (name && data) onEvent({ ...JSON.parse(data), type: name } as ServerEvent);
    }
  }
}
