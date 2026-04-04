import { describe, expect, test } from 'vitest';
import type { Config, Constraint } from '@lintic/core';
import { resolveDatabasePath, resolvePostgresConnectionString } from './runtime.js';

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

describe('resolveDatabasePath', () => {
  test('prefers config.database.path over the environment variable', () => {
    const config = makeConfig({
      database: {
        provider: 'sqlite',
        path: '/config/lintic.db',
      },
    });

    expect(resolveDatabasePath(config, '/env/lintic.db')).toBe('/config/lintic.db');
  });

  test('uses the environment variable when config.database.path is absent', () => {
    const config = makeConfig({
      database: {
        provider: 'sqlite',
      },
    });

    expect(resolveDatabasePath(config, '/env/lintic.db')).toBe('/env/lintic.db');
  });

  test('falls back to lintic.db when neither config nor env specifies a path', () => {
    const config = makeConfig();

    expect(resolveDatabasePath(config, undefined)).toBe('lintic.db');
  });
});

describe('resolvePostgresConnectionString', () => {
  test('prefers config.database.connection_string over DATABASE_URL', () => {
    const config = makeConfig({
      database: {
        provider: 'postgres',
        connection_string: 'postgres://config-user:pass@db/config',
      },
    });

    expect(resolvePostgresConnectionString(config, 'postgres://env-user:pass@db/env')).toBe(
      'postgres://config-user:pass@db/config',
    );
  });

  test('falls back to DATABASE_URL when config.database.connection_string is absent', () => {
    const config = makeConfig({
      database: {
        provider: 'postgres',
      },
    });

    expect(resolvePostgresConnectionString(config, 'postgres://env-user:pass@db/env')).toBe(
      'postgres://env-user:pass@db/env',
    );
  });

  test('throws when postgres is selected and no connection string is available', () => {
    const config = makeConfig({
      database: {
        provider: 'postgres',
      },
    });

    expect(() => resolvePostgresConnectionString(config, undefined)).toThrow(
      /database\.connection_string.*DATABASE_URL/i,
    );
  });
});
