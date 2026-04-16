import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { Config } from './config.js';
import type { Constraint } from './types.js';
import { SQLiteAdapter } from './database/sqlite-adapter.js';
import {
  closeDatabase,
  createDatabase,
  resolveDatabasePath,
  resolvePostgresConnectionString,
  syncPromptsFromConfig,
} from './setup.js';

const BASE_CONSTRAINT: Constraint = {
  max_session_tokens: 50000,
  max_message_tokens: 4000,
  max_interactions: 30,
  context_window: 32000,
  time_limit_minutes: 60,
};

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    agent: {
      provider: 'openai-compatible',
      api_key: 'key',
      model: 'gpt-4o',
    },
    constraints: BASE_CONSTRAINT,
    prompts: [{ id: 'dev', title: 'Dev Testing Session' }],
    ...overrides,
  };
}

describe('setup helpers', () => {
  afterEach(() => {
    delete process.env['DATABASE_URL'];
    delete process.env['LINTIC_DATABASE_PATH'];
  });

  test('resolveDatabasePath prefers config over the environment variable', () => {
    const config = makeConfig({
      database: {
        provider: 'sqlite',
        path: '/config/lintic.db',
      },
    });

    expect(resolveDatabasePath(config, '/env/lintic.db')).toBe('/config/lintic.db');
  });

  test('resolvePostgresConnectionString falls back to DATABASE_URL', () => {
    const config = makeConfig({
      database: {
        provider: 'postgres',
      },
    });

    expect(resolvePostgresConnectionString(config, 'postgres://env-user:pass@db/env')).toBe(
      'postgres://env-user:pass@db/env',
    );
  });

  test('syncPromptsFromConfig creates only missing prompt ids', async () => {
    const db = new SQLiteAdapter(':memory:');
    try {
      await db.createPrompt({ id: 'existing', title: 'Existing prompt' });

      const result = await syncPromptsFromConfig(db, [
        { id: 'existing', title: 'Existing prompt from config' },
        { id: 'new-prompt', title: 'New prompt from config' },
      ]);

      const prompts = await db.listPrompts();
      expect(result.created_prompt_ids).toEqual(['new-prompt']);
      expect(result.skipped_prompt_ids).toEqual(['existing']);
      expect(prompts.map((prompt) => prompt.id)).toEqual(['existing', 'new-prompt']);
      expect(prompts.find((prompt) => prompt.id === 'existing')?.title).toBe('Existing prompt');
    } finally {
      db.close();
    }
  });

  test('createDatabase returns a usable sqlite adapter', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lintic-core-setup-'));
    const dbPath = join(dir, 'lintic.db');
    const db = await createDatabase(makeConfig({
      database: {
        provider: 'sqlite',
        path: dbPath,
      },
    }));

    try {
      await db.listPrompts();
    } finally {
      await closeDatabase(db);
    }
  });
});
