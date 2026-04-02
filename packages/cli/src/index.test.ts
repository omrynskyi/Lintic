import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createStarterConfig, generateLink } from './index.js';

describe('cli helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('createStarterConfig includes generated admin and secret keys', () => {
    const config = createStarterConfig();
    expect(config).toContain('admin_key:');
    expect(config).toContain('secret_key:');
    expect(config).toContain('prompts:');
  });

  test('generateLink returns an assessment URL for a configured prompt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lintic-cli-'));
    const configPath = join(dir, 'lintic.yml');
    writeFileSync(configPath, `agent:
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
`, 'utf8');

    const url = await generateLink({
      promptId: 'library-api',
      email: 'candidate@example.com',
      configPath,
      baseUrl: 'http://localhost:5173',
    });

    expect(url).toContain('http://localhost:5173/assessment?token=');
  });
});
