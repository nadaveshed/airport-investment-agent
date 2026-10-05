import type OpenAI from 'openai';
import type { LlmProvider, ProviderName } from '../../src/agent/llm.js';

type Chunk = OpenAI.Chat.Completions.ChatCompletionChunk;
type Step = Chunk[] | Error;

export const text = (content: string): Chunk =>
  ({ choices: [{ index: 0, delta: { content } }] }) as unknown as Chunk;

export const toolCall = (id: string, name: string, args: object, index = 0): Chunk =>
  ({
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            { index, id, type: 'function', function: { name, arguments: JSON.stringify(args) } },
          ],
        },
      },
    ],
  }) as unknown as Chunk;

/**
 * A scripted stand-in for an OpenAI-compatible client: each `create` call plays the next step
 * (a list of streamed chunks, or an error to throw) and records the request it received.
 */
export function fakeProvider(name: ProviderName, script: Step[]) {
  const requests: OpenAI.Chat.Completions.ChatCompletionCreateParams[] = [];
  let step = 0;
  const client = {
    chat: {
      completions: {
        create: async (params: OpenAI.Chat.Completions.ChatCompletionCreateParams) => {
          requests.push(structuredClone(params));
          const next = script[step++];
          if (!next) throw new Error(`Fake ${name} has no scripted step ${step}`);
          if (next instanceof Error) throw next;
          return (async function* () {
            yield* next;
          })();
        },
      },
    },
  };
  const provider: LlmProvider = {
    name,
    model: `${name}-fake`,
    client: client as unknown as OpenAI,
  };
  return { provider, requests };
}
