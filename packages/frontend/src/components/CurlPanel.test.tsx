import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { CurlPanel } from './CurlPanel.js';

const { mockRunCurlRequest } = vi.hoisted(() => ({
  mockRunCurlRequest: vi.fn(),
}));

vi.mock('../hooks/useWebContainer.js', () => ({
  useWebContainer: () => ({ wc: {}, ready: true, error: null }),
}));

vi.mock('../lib/curl-request.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/curl-request.js')>('../lib/curl-request.js');
  return {
    ...actual,
    runCurlRequest: mockRunCurlRequest,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRunCurlRequest.mockResolvedValue({
    command: 'GET http://localhost:4000/api/health',
    exitCode: 0,
    durationMs: 27,
    stdout: '',
    stderr: '',
    responseBody: '{"ok":true,"count":2}',
    responseHeadersText: 'HTTP/1.1 200 OK\nContent-Type: application/json\nX-Test: yes\n',
    statusLine: 'HTTP/1.1 200 OK',
    statusCode: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json',
      'x-test': 'yes',
    },
    contentType: 'application/json',
  });
});

describe('CurlPanel', () => {
  test('sends a request and renders formatted JSON', async () => {
    render(<CurlPanel />);

    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'http://localhost:4000/api/health' },
    });
    fireEvent.change(screen.getByLabelText('Headers'), {
      target: { value: 'Accept: application/json' },
    });
    fireEvent.change(screen.getByLabelText('Body'), {
      target: { value: '{"hello":"world"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(mockRunCurlRequest).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          method: 'GET',
          url: 'http://localhost:4000/api/health',
          headersText: 'Accept: application/json',
          body: '{"hello":"world"}',
          followRedirects: true,
        }),
      );
    });

    expect(await screen.findByText('Formatted JSON')).toBeInTheDocument();
    expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
    expect(screen.getByText(/"count": 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close response' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close response' }));

    await waitFor(() => {
      expect(screen.queryByText('Formatted JSON')).toBeNull();
    });
  });
});
