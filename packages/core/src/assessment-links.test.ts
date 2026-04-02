import { describe, expect, test, vi } from 'vitest';
import {
  buildAssessmentLink,
  createAssessmentLinkToken,
  generateRandomSecret,
  resolveAdminKey,
  resolveSecretKey,
  verifyAssessmentLinkToken,
} from './assessment-links.js';
import type { Constraint } from './types.js';

const TEST_CONSTRAINT: Constraint = {
  max_session_tokens: 50000,
  max_message_tokens: 2000,
  max_interactions: 30,
  context_window: 8000,
  time_limit_minutes: 60,
};

describe('assessment-links', () => {
  test('creates and verifies an assessment link token', async () => {
    const secret = 'test-secret-key-1234567890';
    const generated = await createAssessmentLinkToken(
      {
        prompt_id: 'library-api',
        email: 'candidate@example.com',
        constraint: TEST_CONSTRAINT,
      },
      secret,
      72,
    );

    const payload = await verifyAssessmentLinkToken(generated.token, secret);
    expect(payload.prompt_id).toBe('library-api');
    expect(payload.email).toBe('candidate@example.com');
    expect(payload.constraint).toEqual(TEST_CONSTRAINT);
    expect(payload.jti).toBe(generated.jti);
  });

  test('rejects verification with the wrong secret', async () => {
    const generated = await createAssessmentLinkToken(
      { prompt_id: 'dev', email: 'dev@example.com', constraint: TEST_CONSTRAINT },
      'correct-secret',
      72,
    );

    await expect(verifyAssessmentLinkToken(generated.token, 'wrong-secret')).rejects.toThrow();
  });

  test('builds an assessment URL and metadata', async () => {
    const generated = await createAssessmentLinkToken(
      { prompt_id: 'dev', email: 'dev@example.com', constraint: TEST_CONSTRAINT },
      'secret-123456',
      24,
    );

    const link = buildAssessmentLink(
      'http://localhost:5173/',
      generated.token,
      'dev',
      'dev@example.com',
      generated.expiresAt,
    );

    expect(link.url).toContain('/assessment?token=');
    expect(link.prompt_id).toBe('dev');
    expect(link.email).toBe('dev@example.com');
    expect(link.expires_at).toBe(generated.expiresAt.toISOString());
  });

  test('resolves admin and secret keys from environment first', () => {
    vi.stubEnv('LINTIC_ADMIN_KEY', 'env-admin');
    vi.stubEnv('LINTIC_SECRET_KEY', 'env-secret');
    expect(resolveAdminKey('config-admin')).toBe('env-admin');
    expect(resolveSecretKey('config-secret')).toBe('env-secret');
    vi.unstubAllEnvs();
  });

  test('falls back to configured keys when env vars are absent', () => {
    expect(resolveAdminKey('config-admin')).toBe('config-admin');
    expect(resolveSecretKey('config-secret')).toBe('config-secret');
  });

  test('generates a random hex secret', () => {
    const secret = generateRandomSecret(16);
    expect(secret).toMatch(/^[a-f0-9]+$/);
    expect(secret.length).toBe(32);
  });
});
