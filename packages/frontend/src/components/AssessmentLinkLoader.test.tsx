import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AssessmentLinkLoader } from './AssessmentLinkLoader.js';

describe('AssessmentLinkLoader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('consumes the assessment link and forwards the created session', async () => {
    const onConsumed = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'sess-1',
        token: 'tok-1',
        prompt: { id: 'prompt-1', title: 'Sorting challenge', description: 'Build it.' },
        agent: { provider: 'openai-compatible', model: 'gpt-4o' },
      }),
    } as Response));

    render(<AssessmentLinkLoader token="token-success" onConsumed={onConsumed} />);

    await waitFor(() => {
      expect(onConsumed).toHaveBeenCalledWith({
        sessionId: 'sess-1',
        sessionToken: 'tok-1',
        prompt: { id: 'prompt-1', title: 'Sorting challenge', description: 'Build it.' },
        agent: { provider: 'openai-compatible', model: 'gpt-4o' },
      });
    });
  });

  test('deduplicates consume requests under StrictMode remounts', async () => {
    const onConsumed = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'sess-1',
        token: 'tok-1',
        prompt: { id: 'prompt-1', title: 'Sorting challenge' },
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    render(
        <StrictMode>
        <AssessmentLinkLoader token="token-strict" onConsumed={onConsumed} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(onConsumed).toHaveBeenCalledWith({
        sessionId: 'sess-1',
        sessionToken: 'tok-1',
        prompt: { id: 'prompt-1', title: 'Sorting challenge' },
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('shows backend errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Link is no longer valid' }),
    } as Response));

    render(<AssessmentLinkLoader token="token-error" onConsumed={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Link is no longer valid')).toBeInTheDocument();
    });
  });
});
