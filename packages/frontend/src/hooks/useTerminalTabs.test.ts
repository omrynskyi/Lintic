import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useTerminalTabs } from './useTerminalTabs.js';

describe('useTerminalTabs', () => {
  it('starts with one tab labeled "Terminal 1", activeId=1, canAdd=true, canClose=false', () => {
    const { result } = renderHook(() => useTerminalTabs());
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0]?.label).toBe('Terminal 1');
    expect(result.current.activeId).toBe(1);
    expect(result.current.canAdd).toBe(true);
    expect(result.current.canClose).toBe(false);
  });

  it('addTab adds "Terminal 2" and makes it active', () => {
    const { result } = renderHook(() => useTerminalTabs());
    act(() => { result.current.addTab(); });
    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.tabs[1]?.label).toBe('Terminal 2');
    expect(result.current.activeId).toBe(2);
    expect(result.current.canClose).toBe(true);
  });

  it('canAdd becomes false at 4 terminals', () => {
    const { result } = renderHook(() => useTerminalTabs());
    act(() => { result.current.addTab(); });
    act(() => { result.current.addTab(); });
    act(() => { result.current.addTab(); });
    expect(result.current.tabs).toHaveLength(4);
    expect(result.current.canAdd).toBe(false);
  });

  it('closeTab(2) when tabs are [1,2] removes Terminal 2 and restores activeId to 1', () => {
    const { result } = renderHook(() => useTerminalTabs());
    act(() => { result.current.addTab(); });
    act(() => { result.current.closeTab(2); });
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0]?.label).toBe('Terminal 1');
    expect(result.current.activeId).toBe(1);
    expect(result.current.canClose).toBe(false);
  });

  it('closing the active middle tab activates the left neighbour', () => {
    const { result } = renderHook(() => useTerminalTabs());
    act(() => { result.current.addTab(); }); // Terminal 2
    act(() => { result.current.addTab(); }); // Terminal 3 — now active
    act(() => { result.current.setActiveId(2); }); // make Terminal 2 active
    act(() => { result.current.closeTab(2); }); // close the active one
    // Left neighbour of index 1 is index 0 (Terminal 1)
    expect(result.current.activeId).toBe(1);
    expect(result.current.tabs).toHaveLength(2);
  });

  it('closeTab on the only tab is a no-op', () => {
    const { result } = renderHook(() => useTerminalTabs());
    act(() => { result.current.closeTab(1); });
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeId).toBe(1);
  });

  it('closing tab 2 of [1,2,3] with activeId=2 activates tab 1 (left neighbour)', () => {
    const { result } = renderHook(() => useTerminalTabs());
    act(() => { result.current.addTab(); }); // 2
    act(() => { result.current.addTab(); }); // 3
    act(() => { result.current.setActiveId(2); });
    act(() => { result.current.closeTab(2); });
    expect(result.current.activeId).toBe(1);
    expect(result.current.tabs.map((t) => t.id)).toEqual([1, 3]);
  });

  it('counter is monotonically increasing — closing tab 2 and adding a new one yields "Terminal 3"', () => {
    const { result } = renderHook(() => useTerminalTabs());
    act(() => { result.current.addTab(); }); // Terminal 2
    act(() => { result.current.closeTab(2); });
    act(() => { result.current.addTab(); }); // Should be Terminal 3, not Terminal 2
    const labels = result.current.tabs.map((t) => t.label);
    expect(labels).toContain('Terminal 3');
    expect(labels).not.toContain('Terminal 2');
  });
});
