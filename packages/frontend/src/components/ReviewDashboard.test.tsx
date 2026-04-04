import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ReviewDashboard } from './ReviewDashboard.js';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const reviewPayload = {
  session: {
    id: 'sess-1',
    prompt_id: 'library-api',
    candidate_email: 'candidate@example.com',
    status: 'completed',
    created_at: Date.now(),
  },
  prompt: {
    id: 'library-api',
    title: 'Library API',
    description: 'Build an API.',
  },
  metrics: [
    { name: 'iteration_efficiency', label: 'Iteration Efficiency', score: 0.75, details: '3/4 productive interactions' },
    { name: 'token_efficiency', label: 'Token Efficiency', score: 0.5, details: 'correctness=0.50, tokens=400' },
  ],
  messages: [],
  recording: {
    session_id: 'sess-1',
    events: [
      { type: 'message', timestamp: 1, payload: { role: 'user', content: 'Please build it' } },
      {
        type: 'tool_call',
        timestamp: 2,
        payload: {
          tool_calls: [{
            id: '1',
            name: 'write_file',
            input: { path: 'src/index.ts', content: 'const app = true;' },
          }],
        },
      },
      { type: 'agent_response', timestamp: 3, payload: { content: 'Implemented', stop_reason: 'end_turn' } },
    ],
  },
};

describe('ReviewDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => reviewPayload,
    } as Response));
  });

  test('renders fetched metrics and conversation replay', async () => {
    render(<ReviewDashboard sessionId="sess-1" isDark={false} onToggleTheme={() => undefined} />);

    await waitFor(() => expect(screen.getByText('Library API')).toBeInTheDocument());
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Please build it')).toBeInTheDocument();
    expect(screen.getByTestId('code-state-content').textContent).toContain('const app = true;');
  });

  test('updates selected event from timeline controls', async () => {
    render(<ReviewDashboard sessionId="sess-1" isDark={false} onToggleTheme={() => undefined} />);

    await waitFor(() => expect(screen.getByTestId('timeline-event-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('timeline-event-1'));

    await waitFor(() => {
      expect(screen.getByTestId('code-state-diff').textContent).toContain('+ const app = true;');
    });
  });

  test('falls back to stored messages when replay events are empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...reviewPayload,
        recording: { session_id: 'sess-1', events: [] },
        messages: [
          { role: 'user', content: 'Please build it' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: '1',
              name: 'write_file',
              input: { path: 'src/index.ts', content: 'const app = true;' },
            }],
          },
          {
            role: 'tool',
            content: null,
            tool_results: [{
              tool_call_id: '1',
              name: 'write_file',
              output: 'ok',
              is_error: false,
            }],
          },
          { role: 'assistant', content: 'Implemented' },
        ],
      }),
    } as Response));

    render(<ReviewDashboard sessionId="sess-1" isDark={false} onToggleTheme={() => undefined} />);

    await waitFor(() => expect(screen.getByText('Please build it')).toBeInTheDocument());
    expect(screen.getByTestId('timeline-event-0')).toBeInTheDocument();
    expect(screen.getByTestId('code-state-content').textContent).toContain('const app = true;');
  });
});
