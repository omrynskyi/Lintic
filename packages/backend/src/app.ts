import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Express } from 'express';
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

  return app;
}
