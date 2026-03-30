import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatPanel } from './ChatPanel.js';

// jsdom doesn't implement scrollIntoView.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock marked and highlight.js to avoid DOM complexity in jsdom.
vi.mock('marked', () => ({
  marked: (text: string, _opts?: unknown) => `<p>${text}</p>`,
  Renderer: class {
    code = ({ text }: { text: string }) => `<pre>${text}</pre>`;
  },
}));

vi.mock('highlight.js', () => ({
  default: {
    getLanguage: () => true,
    highlight: (_text: string, { language }: { language: string }) => ({
      value: `<highlighted lang="${language}" />`,
    }),
  },
}));

vi.mock('highlight.js/styles/github-dark.css', () => ({}));

const defaultConstraints = {
  tokensRemaining: 50000,
  maxTokens: 50000,
  interactionsRemaining: 30,
  maxInteractions: 30,
};

/** An empty-history response for the initial GET /messages call on mount. */
const historyResponse: Response = {
  ok: true,
  json: async () => ({ messages: [] }),
} as unknown as Response;

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(historyResponse));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders the input and send button', () => {
    render(<ChatPanel sessionId="s1" constraints={defaultConstraints} />);
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.getByTestId('chat-send')).toBeInTheDocument();
  });

  test('shows empty state message when no messages', () => {
    render(<ChatPanel sessionId="s1" constraints={defaultConstraints} />);
    expect(screen.getByText(/ask the agent/i)).toBeInTheDocument();
  });

  test('disables input and send when interactions exhausted', () => {
    render(
      <ChatPanel
        sessionId="s1"
        constraints={{ ...defaultConstraints, interactionsRemaining: 0 }}
      />,
    );
    expect(screen.getByTestId('chat-input')).toBeDisabled();
    expect(screen.getByTestId('chat-send')).toBeDisabled();
  });

  test('disables input and send when token budget exhausted', () => {
    render(
      <ChatPanel
        sessionId="s1"
        constraints={{ ...defaultConstraints, tokensRemaining: 0 }}
      />,
    );
    expect(screen.getByTestId('chat-input')).toBeDisabled();
    expect(screen.getByTestId('chat-send')).toBeDisabled();
  });

  test('sends a message and shows agent response', async () => {
    vi.mocked(fetch).mockImplementation((_url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method.toUpperCase() !== 'POST') {
        // History GET — always return empty list.
        return Promise.resolve(historyResponse);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          content: 'Hello from agent',
          constraints_remaining: {
            tokens_remaining: 49000,
            interactions_remaining: 29,
            seconds_remaining: 3500,
          },
        }),
      } as unknown as Response);
    });

    render(<ChatPanel sessionId="s1" constraints={defaultConstraints} />);

    // Wait for history load to settle.
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'Hello agent' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => {
      expect(screen.getByText('You')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getAllByText('Agent').length).toBeGreaterThan(0);
    });
  });

  test('sends message on Enter keydown', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(historyResponse)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: 'ok',
          constraints_remaining: {
            tokens_remaining: 49000,
            interactions_remaining: 29,
            seconds_remaining: 3500,
          },
        }),
      } as unknown as Response);

    render(<ChatPanel sessionId="s1" constraints={defaultConstraints} />);
    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      // 2 calls: one for history load, one for the sent message.
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });
  });

  test('does NOT send on Shift+Enter', async () => {
    render(<ChatPanel sessionId="s1" constraints={defaultConstraints} />);
    // Wait for history load to complete.
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    // Still only one call (the history load).
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  test('shows error message when request fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(historyResponse)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Token budget exceeded' }),
      } as unknown as Response);

    render(<ChatPanel sessionId="s1" constraints={defaultConstraints} />);
    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => {
      expect(screen.getByText('Token budget exceeded')).toBeInTheDocument();
    });
  });

  test('calls onConstraintsUpdate when backend returns remaining', async () => {
    const onUpdate = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(historyResponse)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: 'hi',
          constraints_remaining: {
            tokens_remaining: 49000,
            interactions_remaining: 29,
            seconds_remaining: 3500,
          },
        }),
      } as unknown as Response);

    render(
      <ChatPanel
        sessionId="s1"
        constraints={defaultConstraints}
        onConstraintsUpdate={onUpdate}
      />,
    );

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({
        tokensRemaining: 49000,
        interactionsRemaining: 29,
      });
    });
  });

  test('shows no session placeholder when sessionId is null', () => {
    render(<ChatPanel sessionId={null} constraints={defaultConstraints} />);
    // Component still renders its shell; no history fetch since sessionId is null.
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
  });

  test('shows loading spinner while waiting for agent response', async () => {
    let resolvePost!: (value: Response) => void;
    const postPromise = new Promise<Response>((res) => {
      resolvePost = res;
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(historyResponse)
      .mockReturnValueOnce(postPromise);

    render(<ChatPanel sessionId="s1" constraints={defaultConstraints} />);
    // Wait for history load.
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    // Spinner should be visible immediately.
    await waitFor(() => {
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    // Resolve the pending request.
    resolvePost({
      ok: true,
      json: async () => ({
        content: 'done',
        constraints_remaining: {
          tokens_remaining: 49000,
          interactions_remaining: 29,
          seconds_remaining: 3500,
        },
      }),
    } as unknown as Response);

    // Spinner disappears after response.
    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });

  test('renders agent response as HTML (markdown)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(historyResponse)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: '**bold text**',
          constraints_remaining: {
            tokens_remaining: 49000,
            interactions_remaining: 29,
            seconds_remaining: 3500,
          },
        }),
      } as unknown as Response);

    render(<ChatPanel sessionId="s1" constraints={defaultConstraints} />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    // The mocked `marked` wraps content in <p>...</p>, so the rendered HTML
    // should contain the agent content inside a paragraph.
    await waitFor(() => {
      const agentBubbles = screen.getAllByTestId('agent-message');
      expect(agentBubbles.length).toBeGreaterThan(0);
      expect(agentBubbles[0]!.innerHTML).toBe('<p>**bold text**</p>');
    });
  });
});
