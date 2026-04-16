import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDatabase as createSharedDatabase,
  findConfigPath as findSharedConfigPath,
  resolveDatabasePath as resolveSharedDatabasePath,
  resolvePostgresConnectionString as resolveSharedConnectionString,
  type Config,
  type DatabaseAdapter,
} from '@lintic/core';

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
  return findSharedConfigPath({ moduleUrl });
}

export function resolveDatabasePath(config: Config, envPath = process.env['LINTIC_DATABASE_PATH']): string {
  return resolveSharedDatabasePath(config, envPath);
}

export function resolvePostgresConnectionString(
  config: Config,
  envConnectionString = process.env['DATABASE_URL'],
): string {
  return resolveSharedConnectionString(config, envConnectionString);
}

export async function createDatabase(config: Config): Promise<DatabaseAdapter> {
  return createSharedDatabase(config);
}

export function resolveFrontendDistPath(moduleUrl: string = import.meta.url): string {
  return join(dirname(fileURLToPath(moduleUrl)), '../../frontend/dist');
}
