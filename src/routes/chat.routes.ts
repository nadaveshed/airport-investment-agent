import { Router } from 'express';
import type { createChatController } from '../controllers/chat.controller.js';
import { chatRateLimit } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { chatRequestSchema, sessionParamsSchema } from '../schemas/chat.schema.js';

export function chatRoutes(controller: ReturnType<typeof createChatController>) {
  return Router()
    .post('/', chatRateLimit, validate({ body: chatRequestSchema }), controller.send)
    .get('/:sessionId', validate({ params: sessionParamsSchema }), controller.history);
}
