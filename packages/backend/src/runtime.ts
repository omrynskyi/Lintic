import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from '@lintic/core';

export function loadEnv(moduleUrl: string = import.meta.url): void {
  const candidates = [
    './.env',
    join(dirname(fileURLToPath(moduleUrl)), '../../..', '.env'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    process.loadEnvFile(candidate);
    return;
  }
}

export function findConfigPath(moduleUrl: string = import.meta.url): string {
  if (existsSync('./lintic.yml')) return './lintic.yml';

  const repoRoot = join(dirname(fileURLToPath(moduleUrl)), '../../..');
  const candidate = join(repoRoot, 'lintic.yml');
  if (existsSync(candidate)) return candidate;

  throw new Error(
    'lintic.yml not found. Create one in the current directory or the repo root.',
  );
}

export function resolveDatabasePath(config: Config, envPath = process.env['LINTIC_DATABASE_PATH']): string {
  return config.database?.path ?? envPath ?? 'lintic.db';
}

export function resolveFrontendDistPath(moduleUrl: string = import.meta.url): string {
  return join(dirname(fileURLToPath(moduleUrl)), '../../frontend/dist');
}
