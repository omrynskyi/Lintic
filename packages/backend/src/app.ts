import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { DatabaseAdapter, AgentAdapter, Config } from '@lintic/core';
import { createApiRouter } from './routes/api.js';

export interface AppOptions {
  frontendDistPath?: string;
}

export function createApp(
  db: DatabaseAdapter,
  adapter: AgentAdapter,
  config: Config,
  options: AppOptions = {},
): Express {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
  });
  app.use(express.json());

  app.use('/api', createApiRouter(db, adapter, config));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const frontendDistPath = options.frontendDistPath;
  if (frontendDistPath) {
    const indexHtmlPath = join(frontendDistPath, 'index.html');
    if (existsSync(indexHtmlPath)) {
      app.use(express.static(frontendDistPath));

      app.get(/^\/(?!api(?:\/|$)|health$).*/, (req, res, next) => {
        if (req.path.includes('.')) {
          next();
          return;
        }
        res.sendFile(indexHtmlPath);
      });
    }
  }

  // JSON error handler — must have 4 params so Express treats it as an error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[server error]', err);
    res.status(500).json({ error: message });
  });

  return app;
}
