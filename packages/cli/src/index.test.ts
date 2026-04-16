import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { closeDatabase, createDatabase, loadConfig } from '@lintic/core';
import {
  createStarterConfig,
  doctorSetup,
  generateLink,
  main,
  migrateSetup,
} from './index.js';

const ORIGINAL_CWD = process.cwd();

function writeConfigFile(dir: string, contents: string): string {
  const configPath = join(dir, 'lintic.yml');
  writeFileSync(configPath, contents, 'utf8');
  return configPath;
}

function validConfig(dbPath: string): string {
  return `agent:
  provider: openai-compatible
  api_key: test-key
  model: gpt-4o

constraints:
  max_session_tokens: 50000
  max_message_tokens: 4000
  context_window: 32000
  max_interactions: 30
  time_limit_minutes: 60

database:
  provider: sqlite
  path: ${dbPath}

api:
  admin_key: local-admin
  secret_key: local-secret

evaluation:
  provider: openai-compatible
  api_key: test-key
  model: gpt-4.1-mini

prompts:
  - id: library-api
    title: Library API
`;
}

describe('cli helpers', () => {
  beforeEach(() => {
    process.chdir(ORIGINAL_CWD);
  });

  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test('createStarterConfig includes commented setup examples and generated keys', () => {
    const config = createStarterConfig();
    expect(config).toContain('# Lintic starter configuration');
    expect(config).toContain('database:');
    expect(config).toContain('# Managed Postgres example:');
    expect(config).toContain('evaluation:');
    expect(config).toContain('admin_key:');
    expect(config).toContain('secret_key:');
  });

  test('main init writes lintic.yml and refuses overwrite', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lintic-cli-init-'));
    process.chdir(dir);

    await main(['init']);

    const configPath = join(dir, 'lintic.yml');
    expect(existsSync(configPath)).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toContain('# Lintic starter configuration');

    await expect(main(['init'])).rejects.toThrow('lintic.yml already exists');
  });

  test('generateLink returns an assessment URL for a configured prompt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lintic-cli-link-'));
    const configPath = writeConfigFile(dir, `agent:
  provider: openai-compatible
  api_key: test-key
  model: gpt-4o

constraints:
  max_session_tokens: 50000
  max_message_tokens: 4000
  context_window: 32000
  max_interactions: 30
  time_limit_minutes: 60

api:
  secret_key: local-secret

prompts:
  - id: library-api
    title: Library API
`);

    const url = await generateLink({
      promptId: 'library-api',
      email: 'candidate@example.com',
      configPath,
      baseUrl: 'http://localhost:5173',
    });

    expect(url).toContain('http://localhost:5173/assessment?token=');
  });

  test('migrateSetup provisions schema and syncs prompts idempotently', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lintic-cli-migrate-'));
    const dbPath = join(dir, 'lintic.db');
    const configPath = writeConfigFile(dir, validConfig(dbPath));

    const first = await migrateSetup({ configPath });
    const second = await migrateSetup({ configPath });

    expect(first.provider).toBe('sqlite');
    expect(first.created).toBe(1);
    expect(first.skipped).toBe(0);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);

    const db = await createDatabase(loadConfig(configPath));
    try {
      const prompts = await db.listPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0]?.id).toBe('library-api');
    } finally {
      await closeDatabase(db);
    }
  });

  test('doctorSetup passes on a valid sqlite setup', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lintic-cli-doctor-pass-'));
    const configPath = writeConfigFile(dir, validConfig(join(dir, 'lintic.db')));

    const result = await doctorSetup({ configPath });

    expect(result.ok).toBe(true);
    expect(result.checks.find((check) => check.label === 'Database connection')?.status).toBe('pass');
    expect(result.checks.find((check) => check.label === 'Schema access')?.status).toBe('pass');
  });

  test('doctorSetup fails clearly when env vars are missing during config parsing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lintic-cli-doctor-env-'));
    const configPath = writeConfigFile(dir, `agent:
  provider: openai-compatible
  api_key: \${OPENAI_API_KEY}
  model: gpt-4o

constraints:
  max_session_tokens: 50000
  max_message_tokens: 4000
  context_window: 32000
  max_interactions: 30
  time_limit_minutes: 60

api:
  admin_key: admin
  secret_key: secret

prompts:
  - id: library-api
    title: Library API
`);

    const result = await doctorSetup({ configPath });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.label === 'Config parsing')?.status).toBe('fail');
  });

  test('doctorSetup fails when signing secret is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lintic-cli-doctor-secret-'));
    const configPath = writeConfigFile(dir, `agent:
  provider: openai-compatible
  api_key: test-key
  model: gpt-4o

constraints:
  max_session_tokens: 50000
  max_message_tokens: 4000
  context_window: 32000
  max_interactions: 30
  time_limit_minutes: 60

database:
  provider: sqlite
  path: ${join(dir, 'lintic.db')}

api:
  admin_key: local-admin

prompts:
  - id: library-api
    title: Library API
`);

    const result = await doctorSetup({ configPath });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.label === 'Signing secret')?.status).toBe('fail');
  });

  test('doctorSetup fails clearly when the database is unreachable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lintic-cli-doctor-db-'));
    const configPath = writeConfigFile(dir, `agent:
  provider: openai-compatible
  api_key: test-key
  model: gpt-4o

constraints:
  max_session_tokens: 50000
  max_message_tokens: 4000
  context_window: 32000
  max_interactions: 30
  time_limit_minutes: 60

database:
  provider: postgres
  connection_string: postgres://lintic:lintic@127.0.0.1:1/lintic?connect_timeout=1

api:
  admin_key: local-admin
  secret_key: local-secret

prompts:
  - id: library-api
    title: Library API
`);

    const result = await doctorSetup({ configPath });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.label === 'Database connection')?.status).toBe('fail');
    expect(result.checks.find((check) => check.label === 'Schema access')?.status).toBe('fail');
  });
});
