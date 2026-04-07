import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresAdapter, SQLiteAdapter, type Config, type DatabaseAdapter } from '@lintic/core';

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

export function resolvePostgresConnectionString(
  config: Config,
  envConnectionString = process.env['DATABASE_URL'],
): string {
  const connectionString = config.database?.connection_string ?? envConnectionString;
  if (!connectionString) {
    throw new Error(
      'PostgreSQL database provider requires database.connection_string in lintic.yml or DATABASE_URL in the environment.',
    );
  }
  return connectionString;
}

export async function createDatabase(config: Config): Promise<DatabaseAdapter> {
  const provider = config.database?.provider ?? 'sqlite';

  if (provider === 'postgres') {
    const db = new PostgresAdapter({
      connectionString: resolvePostgresConnectionString(config),
    });

    try {
      await db.initialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to PostgreSQL database: ${message}`);
    }

    return db;
  }

  return new SQLiteAdapter(resolveDatabasePath(config));
}

export function resolveFrontendDistPath(moduleUrl: string = import.meta.url): string {
  return join(dirname(fileURLToPath(moduleUrl)), '../../frontend/dist');
}
