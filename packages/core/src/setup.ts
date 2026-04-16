import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config, PromptConfig } from './config.js';
import type { DatabaseAdapter } from './database.js';
import { PostgresAdapter } from './database.js';
import { SQLiteAdapter } from './database.js';

export interface FindConfigPathOptions {
  cwd?: string;
  moduleUrl?: string;
  filename?: string;
}

export interface PromptSyncResult {
  created: number;
  skipped: number;
  created_prompt_ids: string[];
  skipped_prompt_ids: string[];
}

export function findConfigPath(options: FindConfigPathOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const filename = options.filename ?? 'lintic.yml';
  const localCandidate = resolve(cwd, filename);
  if (existsSync(localCandidate)) {
    return localCandidate;
  }

  if (options.moduleUrl) {
    const repoRoot = join(dirname(fileURLToPath(options.moduleUrl)), '../../..');
    const repoCandidate = resolve(repoRoot, filename);
    if (existsSync(repoCandidate)) {
      return repoCandidate;
    }
  }

  throw new Error(
    `${filename} not found. Create one in the current directory or the repo root.`,
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

export async function closeDatabase(db: DatabaseAdapter): Promise<void> {
  if (db instanceof PostgresAdapter) {
    await db.close();
    return;
  }

  if (db instanceof SQLiteAdapter) {
    db.close();
  }
}

export async function syncPromptsFromConfig(
  db: DatabaseAdapter,
  prompts: PromptConfig[],
): Promise<PromptSyncResult> {
  const existing = new Set((await db.listPrompts()).map((prompt) => prompt.id));
  const created_prompt_ids: string[] = [];
  const skipped_prompt_ids: string[] = [];

  for (const prompt of prompts) {
    if (existing.has(prompt.id)) {
      skipped_prompt_ids.push(prompt.id);
      continue;
    }

    await db.createPrompt(prompt);
    existing.add(prompt.id);
    created_prompt_ids.push(prompt.id);
  }

  return {
    created: created_prompt_ids.length,
    skipped: skipped_prompt_ids.length,
    created_prompt_ids,
    skipped_prompt_ids,
  };
}
