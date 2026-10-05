import { z } from 'zod';

export const MAX_MESSAGE_LENGTH = 2000;

export const chatRequestSchema = z.object({
  sessionId: z.uuid().optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const sessionParamsSchema = z.object({ sessionId: z.uuid() });
