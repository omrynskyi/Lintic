import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWc = { fs: {} };

vi.mock('../lib/webcontainer.js', () => ({
  getWebContainer: vi.fn(),
}));

import { getWebContainer } from '../lib/webcontainer.js';
import { useWebContainer } from './useWebContainer.js';

beforeEach(() => vi.clearAllMocks());

describe('useWebContainer', () => {
  it('starts with ready=false and wc=null', () => {
    vi.mocked(getWebContainer).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useWebContainer());
    expect(result.current.ready).toBe(false);
    expect(result.current.wc).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sets ready=true and wc when boot resolves', async () => {
    vi.mocked(getWebContainer).mockResolvedValue(mockWc as any);
    const { result } = renderHook(() => useWebContainer());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.wc).toBe(mockWc);
    expect(result.current.error).toBeNull();
  });

  it('sets error when boot rejects', async () => {
    vi.mocked(getWebContainer).mockRejectedValue(new Error('boot failed'));
    const { result } = renderHook(() => useWebContainer());
    await waitFor(() => expect(result.current.error).toBe('boot failed'));
    expect(result.current.ready).toBe(false);
    expect(result.current.wc).toBeNull();
  });
});
