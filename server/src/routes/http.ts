import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../services/context.js';

// Wraps async handlers so thrown errors reach the error middleware.
export const asyncHandler =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new ServiceError(422, result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  }
  return result.data;
}

export const uuid = z.string().uuid();

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(422).json({ error: error.issues.map((i) => i.message).join('; ') });
    return;
  }
  // Keep internal details (SQL, stack traces, provider payloads) out of responses.
  console.error('[api] unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
}
