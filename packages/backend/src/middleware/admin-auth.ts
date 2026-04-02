import type { Request, Response, NextFunction, RequestHandler } from 'express';

export function requireAdminKey(expectedKey?: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expectedKey) {
      res.status(503).json({ error: 'Admin API key is not configured' });
      return;
    }

    const providedKey = req.headers['x-lintic-api-key'];
    if (typeof providedKey !== 'string' || providedKey !== expectedKey) {
      res.status(401).json({ error: 'Missing or invalid X-Lintic-Api-Key header' });
      return;
    }

    next();
  };
}
