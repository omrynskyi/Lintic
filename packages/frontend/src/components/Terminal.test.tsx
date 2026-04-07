import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebContainer } from '@webcontainer/api';

// jsdom does not implement ResizeObserver — stub it out.
globalThis.ResizeObserver = vi.fn().mockImplementation(function () {
  return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
}) as unknown as typeof ResizeObserver;

const mockTermInstance = {
  loadAddon: vi.fn(),
  open: vi.fn(),
  onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  write: vi.fn(),
  dispose: vi.fn(),
  cols: 80,
  rows: 24,
};
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function () {
    return mockTermInstance;
  }),
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function () {
    return { fit: vi.fn() };
  }),
}));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

import { Terminal } from './Terminal.js';

const mockSpawn = vi.fn();

function makeMockWc() {
  const readable = new ReadableStream({ start: (c) => c.close() });
  const writable = new WritableStream();
  mockSpawn.mockResolvedValue({ output: readable, input: writable });
  return { spawn: mockSpawn } as unknown as WebContainer;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTermInstance.open.mockImplementation(() => {});
  mockTermInstance.onData.mockReturnValue({ dispose: vi.fn() });
});

describe('Terminal', () => {
  it('renders a container div', () => {
    render(<Terminal wc={null} />);
    expect(document.querySelector('[data-testid="terminal-container"]')).toBeInTheDocument();
  });

  it('does not call spawn when wc is null', () => {
    render(<Terminal wc={null} />);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('calls wc.spawn with jsh when wc is provided', async () => {
    const wc = makeMockWc();
    render(<Terminal wc={wc} />);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledWith('jsh', {
      terminal: { cols: 80, rows: 24 },
    }));
  });
});
