import { useRef, useState } from 'react';

export interface TerminalTab {
  id: number;     // monotonically increasing — never reused after close
  label: string;  // "Terminal 1", "Terminal 2", ...
}

const MAX_TERMINALS = 4;

export interface UseTerminalTabsReturn {
  tabs: TerminalTab[];
  activeId: number;
  setActiveId: (id: number) => void;
  addTab: () => void;
  closeTab: (id: number) => void;
  canAdd: boolean;
  canClose: boolean;
}

export function useTerminalTabs(): UseTerminalTabsReturn {
  const [tabs, setTabs] = useState<TerminalTab[]>([{ id: 1, label: 'Terminal 1' }]);
  const [activeId, setActiveId] = useState(1);
  const nextId = useRef(2);

  function addTab() {
    const id = nextId.current++;
    setTabs((prev) => [...prev, { id, label: `Terminal ${id}` }]);
    setActiveId(id);
  }

  function closeTab(id: number) {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (id === activeId) {
        const newActive = next[Math.max(0, idx - 1)]?.id ?? next[0]?.id;
        if (newActive !== undefined) setActiveId(newActive);
      }
      return next;
    });
  }

  return {
    tabs,
    activeId,
    setActiveId,
    addTab,
    closeTab,
    canAdd: tabs.length < MAX_TERMINALS,
    canClose: tabs.length > 1,
  };
}
