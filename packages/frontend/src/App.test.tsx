import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from './App.js';

vi.mock('./components/DevSetup.js', () => ({
  DevSetup: ({ onSessionReady }: { onSessionReady: (session: unknown) => void }) => (
    <button
      type="button"
      data-testid="mock-start-session"
      onClick={() => onSessionReady({
        sessionId: 'sess-1',
        sessionToken: 'tok-1',
        agentConfig: {
          provider: 'openai-compatible',
          api_key: 'sk-test',
          model: 'gpt-4o',
        },
        prompt: {
          id: 'prompt-1',
          title: 'Build a task runner',
          description: 'Create a CLI utility that queues and runs jobs.',
          tags: ['backend', 'cli'],
        },
      })}
    >
      Start
    </button>
  ),
}));

vi.mock('./components/TopBar.js', () => ({
  TopBar: ({ onViewPrompt }: { onViewPrompt?: () => void }) => (
    <button type="button" data-testid="mock-view-prompt" onClick={onViewPrompt}>
      View Prompt
    </button>
  ),
}));

vi.mock('./components/SplitPane.js', () => ({
  SplitPane: ({ left, right }: { left: ReactNode; right: ReactNode }) => (
    <div data-testid="split-pane">
      <div>{left}</div>
      <div>{right}</div>
    </div>
  ),
}));

vi.mock('./components/IdePanel.js', () => ({
  IdePanel: () => <div data-testid="ide-panel">IDE</div>,
}));

vi.mock('./components/ChatPanel.js', () => ({
  ChatPanel: () => <div data-testid="chat-panel">Chat</div>,
}));

vi.mock('./components/Toast.js', () => ({
  Toast: () => null,
}));

vi.mock('./components/ReviewDashboard.js', () => ({
  ReviewDashboard: () => <div data-testid="review-dashboard">Review</div>,
}));

vi.mock('./components/AssessmentLinkLoader.js', () => ({
  AssessmentLinkLoader: () => <div data-testid="assessment-loader">Assessment</div>,
}));

vi.mock('./lib/useConstraintTimer.js', () => ({
  useConstraintTimer: () => [
    {
      secondsRemaining: 3600,
      tokensRemaining: 50000,
      interactionsRemaining: 30,
      maxTokens: 50000,
      maxInteractions: 30,
      timeLimitSeconds: 3600,
    },
    vi.fn(),
  ],
}));

vi.mock('./lib/webcontainer.js', () => ({
  getWebContainer: vi.fn().mockResolvedValue(null),
}));

vi.mock('./lib/review-replay.js', () => ({
  getReviewSessionId: () => null,
}));

describe('App prompt display', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    window.history.replaceState({}, '', '/');
  });

  test('shows the prompt panel when a session starts, allows dismiss, and reopens it from the top bar', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('mock-start-session'));

    expect(screen.getByTestId('prompt-panel')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-title')).toHaveTextContent('Build a task runner');
    expect(screen.getByTestId('ide-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('dismiss-prompt'));
    expect(screen.queryByTestId('prompt-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-view-prompt'));
    expect(screen.getByTestId('prompt-panel')).toBeInTheDocument();
  });
});
