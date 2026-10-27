import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config/index.js';
import { verifySessionToken } from '../auth/session.js';

export const SESSION_COOKIE = 'bs_session';

declare module 'express-serve-static-core' {
  interface Request {
    actor?: string;
  }
}

export function requireAdmin(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const session = token && config.SESSION_SECRET ? verifySessionToken(token, config.SESSION_SECRET) : null;
    if (!session) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    req.actor = session.sub;
    next();
  };
}
