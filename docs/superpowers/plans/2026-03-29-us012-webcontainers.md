# US-012: WebContainers Runtime Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boot a WebContainer in the browser, connect an xterm.js terminal to its shell, and keep the Monaco editor file state in sync with the WebContainer filesystem.

**Architecture:** A singleton `webcontainer.ts` module boots one `WebContainer` instance per page and exposes file I/O helpers. A `useWebContainer` hook wraps boot/error state for React components. A `Terminal` component renders an xterm.js terminal wired to a `jsh` process in the container. `IdePanel` gains a bottom terminal panel, writes every Monaco edit to the WC filesystem, and watches the WC filesystem for changes to update its in-memory file state.

**Tech Stack:** `@webcontainer/api`, `@xterm/xterm`, `@xterm/addon-fit`, React hooks, Vitest (mocked in jsdom), Vite dev-server headers.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/frontend/vite.config.ts` | Add COOP/COEP headers required by SharedArrayBuffer |
| Create | `packages/frontend/src/lib/webcontainer.ts` | Singleton boot, `writeFile`, `readFile`, `watchFiles`, `resetForTests` |
| Create | `packages/frontend/src/lib/webcontainer.test.ts` | Unit tests (mocked `@webcontainer/api`) |
| Create | `packages/frontend/src/hooks/useWebContainer.ts` | React hook — exposes `{ wc, ready, error }` |
| Create | `packages/frontend/src/hooks/useWebContainer.test.tsx` | Hook tests with mocked singleton |
| Create | `packages/frontend/src/components/Terminal.tsx` | xterm.js terminal connected to WC `jsh` process |
| Create | `packages/frontend/src/components/Terminal.test.tsx` | Component tests (mocked xterm + WC) |
| Modify | `packages/frontend/src/components/IdePanel.tsx` | Add terminal panel, Monaco→WC sync, WC→Monaco watch |
| Modify | `packages/frontend/src/components/IdePanel.test.tsx` | Add tests for sync behaviour |

---

## Task 1: COOP/COEP headers + install packages

**Files:**
- Modify: `packages/frontend/vite.config.ts`

WebContainers require `SharedArrayBuffer`, which requires both `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers on every response.

- [ ] **Step 1: Install runtime packages**

```bash
cd packages/frontend
npm install @webcontainer/api @xterm/xterm @xterm/addon-fit
```

Expected: packages appear in `node_modules`; `package.json` `dependencies` gains the three entries.

- [ ] **Step 2: Add headers to vite dev server**

Replace the contents of `packages/frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

- [ ] **Step 3: Verify typecheck still passes**

```bash
cd packages/frontend
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/vite.config.ts packages/frontend/package.json packages/frontend/package-lock.json
git commit -m "feat(frontend): add COOP/COEP headers and install webcontainer/xterm packages"
```

---

## Task 2: WebContainer singleton module

**Files:**
- Create: `packages/frontend/src/lib/webcontainer.ts`
- Create: `packages/frontend/src/lib/webcontainer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/frontend/src/lib/webcontainer.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFs = {
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('file-content'),
  watch: vi.fn().mockReturnValue({ close: vi.fn() }),
};

const mockWc = { fs: mockFs };

vi.mock('@webcontainer/api', () => ({
  WebContainer: { boot: vi.fn().mockResolvedValue(mockWc) },
}));

// Import after mock so the module sees the mocked API.
const { getWebContainer, writeFile, readFile, watchFiles, resetForTests } =
  await import('./webcontainer.js');

beforeEach(() => {
  resetForTests();
  vi.clearAllMocks();
  mockFs.writeFile.mockResolvedValue(undefined);
  mockFs.readFile.mockResolvedValue('file-content');
  mockFs.watch.mockReturnValue({ close: vi.fn() });
});

describe('getWebContainer', () => {
  it('boots once and returns the same instance', async () => {
    const { WebContainer } = await import('@webcontainer/api');
    const a = await getWebContainer();
    const b = await getWebContainer();
    expect(a).toBe(b);
    expect(WebContainer.boot).toHaveBeenCalledTimes(1);
  });
});

describe('writeFile', () => {
  it('writes content to the WebContainer filesystem', async () => {
    await writeFile('/index.ts', 'const x = 1;');
    expect(mockFs.writeFile).toHaveBeenCalledWith('/index.ts', 'const x = 1;');
  });
});

describe('readFile', () => {
  it('reads content from the WebContainer filesystem', async () => {
    const content = await readFile('/index.ts');
    expect(content).toBe('file-content');
    expect(mockFs.readFile).toHaveBeenCalledWith('/index.ts', 'utf-8');
  });
});

describe('watchFiles', () => {
  it('registers a watch on the given path and returns a cleanup function', async () => {
    const listener = vi.fn();
    const close = vi.fn();
    mockFs.watch.mockReturnValue({ close });

    const stop = await watchFiles('/', listener);
    expect(mockFs.watch).toHaveBeenCalledWith('/', { recursive: true }, listener);

    stop();
    expect(close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/frontend
npx vitest run src/lib/webcontainer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `packages/frontend/src/lib/webcontainer.ts`:

```typescript
import { WebContainer } from '@webcontainer/api';

let instance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

export async function getWebContainer(): Promise<WebContainer> {
  if (instance) return instance;
  if (bootPromise) return bootPromise;
  bootPromise = WebContainer.boot().then((wc) => {
    instance = wc;
    return wc;
  });
  return bootPromise;
}

export async function writeFile(path: string, content: string): Promise<void> {
  const wc = await getWebContainer();
  await wc.fs.writeFile(path, content);
}

export async function readFile(path: string): Promise<string> {
  const wc = await getWebContainer();
  return wc.fs.readFile(path, 'utf-8');
}

export async function watchFiles(
  path: string,
  listener: (event: string, filename: string) => void,
): Promise<() => void> {
  const wc = await getWebContainer();
  const watcher = wc.fs.watch(path, { recursive: true }, listener);
  return () => watcher.close();
}

/** Only for use in tests — resets singleton state between test cases. */
export function resetForTests(): void {
  instance = null;
  bootPromise = null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/frontend
npx vitest run src/lib/webcontainer.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/lib/webcontainer.ts packages/frontend/src/lib/webcontainer.test.ts
git commit -m "feat(frontend): add WebContainer singleton module with writeFile/readFile/watchFiles"
```

---

## Task 3: `useWebContainer` hook

**Files:**
- Create: `packages/frontend/src/hooks/useWebContainer.ts`
- Create: `packages/frontend/src/hooks/useWebContainer.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/frontend/src/hooks/useWebContainer.test.tsx`:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/frontend
npx vitest run src/hooks/useWebContainer.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create hooks directory and implement the hook**

```bash
mkdir -p packages/frontend/src/hooks
```

Create `packages/frontend/src/hooks/useWebContainer.ts`:

```typescript
import { useEffect, useState } from 'react';
import type { WebContainer } from '@webcontainer/api';
import { getWebContainer } from '../lib/webcontainer.js';

export interface WebContainerState {
  wc: WebContainer | null;
  ready: boolean;
  error: string | null;
}

export function useWebContainer(): WebContainerState {
  const [wc, setWc] = useState<WebContainer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWebContainer()
      .then((container) => {
        if (!cancelled) {
          setWc(container);
          setReady(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { wc, ready, error };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/frontend
npx vitest run src/hooks/useWebContainer.test.tsx
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/hooks/useWebContainer.ts packages/frontend/src/hooks/useWebContainer.test.tsx
git commit -m "feat(frontend): add useWebContainer hook"
```

---

## Task 4: Terminal component

**Files:**
- Create: `packages/frontend/src/components/Terminal.tsx`
- Create: `packages/frontend/src/components/Terminal.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/frontend/src/components/Terminal.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebContainer } from '@webcontainer/api';

// xterm uses browser APIs not available in jsdom — mock it entirely.
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
  Terminal: vi.fn().mockImplementation(() => mockTermInstance),
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })),
}));
// CSS import is a no-op in tests.
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/frontend
npx vitest run src/components/Terminal.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Terminal component**

Create `packages/frontend/src/components/Terminal.tsx`:

```typescript
import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { WebContainer } from '@webcontainer/api';
import '@xterm/xterm/css/xterm.css';

interface Props {
  wc: WebContainer | null;
}

export function Terminal({ wc }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);

  // Mount xterm once into the DOM element.
  useEffect(() => {
    if (!containerRef.current) return;
    const term = new XTerm({
      theme: { background: '#0c0c0c', foreground: '#d4d4d4', cursor: '#569cd6' },
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // Spawn a shell and wire I/O when the WebContainer becomes available.
  useEffect(() => {
    if (!wc || !termRef.current) return;
    const term = termRef.current;
    let cleanup: (() => void) | undefined;

    void wc
      .spawn('jsh', { terminal: { cols: term.cols, rows: term.rows } })
      .then((process) => {
        const inputWriter = process.input.getWriter();
        const onData = term.onData((data) => {
          void inputWriter.write(data);
        });

        const reader = process.output.getReader();
        let active = true;
        function pump() {
          void reader.read().then(({ done, value }) => {
            if (done || !active) return;
            term.write(value);
            pump();
          });
        }
        pump();

        cleanup = () => {
          active = false;
          onData.dispose();
          void inputWriter.close().catch(() => {});
        };
      });

    return () => cleanup?.();
  }, [wc]);

  return (
    <div
      data-testid="terminal-container"
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#0c0c0c', padding: '4px 8px' }}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/frontend
npx vitest run src/components/Terminal.test.tsx
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/Terminal.tsx packages/frontend/src/components/Terminal.test.tsx
git commit -m "feat(frontend): add Terminal component (xterm.js + WebContainer jsh)"
```

---

## Task 5: Wire terminal + file sync into IdePanel

**Files:**
- Modify: `packages/frontend/src/components/IdePanel.tsx`
- Modify: `packages/frontend/src/components/IdePanel.test.tsx`

This task adds the terminal panel below the editor and bidirectional file sync:
- **Monaco→WC**: on every `onChange`, write the updated file to WC FS.
- **WC→Monaco**: watch `/` recursively; when a non-directory file changes, read it from WC and update the in-memory `files` state. Skips `node_modules` to avoid flooding state.

- [ ] **Step 1: Write failing tests for sync behaviour**

Open `packages/frontend/src/components/IdePanel.test.tsx` and **append** these new describe blocks (do not remove existing tests):

```typescript
// --- New tests for US-012 ---

import { vi } from 'vitest';

const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue('from-wc');
let capturedWatchListener: ((event: string, filename: string) => void) | null = null;
const mockStopWatch = vi.fn();
const mockWatchFiles = vi.fn().mockImplementation((_path: string, listener: any) => {
  capturedWatchListener = listener;
  return Promise.resolve(mockStopWatch);
});
const mockWc = { fs: {} };

vi.mock('../lib/webcontainer.js', () => ({
  writeFile: mockWriteFile,
  readFile: mockReadFile,
  watchFiles: mockWatchFiles,
}));
vi.mock('../hooks/useWebContainer.js', () => ({
  useWebContainer: vi.fn().mockReturnValue({ wc: mockWc, ready: true, error: null }),
}));
vi.mock('./Terminal.js', () => ({
  Terminal: () => <div data-testid="terminal" />,
}));

describe('IdePanel — Monaco→WC sync', () => {
  it('writes file to WC when Monaco onChange fires', async () => {
    render(<IdePanel />);
    // Create a file so a tab is open.
    fireEvent.click(screen.getByLabelText('New file'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'index.ts' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    // Simulate Monaco onChange (the MonacoEditor mock calls onChange with textarea value).
    const editor = document.querySelector('textarea')!;
    fireEvent.change(editor, { target: { value: 'const x = 1;' } });

    await waitFor(() =>
      expect(mockWriteFile).toHaveBeenCalledWith('index.ts', 'const x = 1;'),
    );
  });
});

describe('IdePanel — WC→Monaco sync', () => {
  it('updates file content when WC filesystem emits a change event', async () => {
    mockReadFile.mockResolvedValue('updated-from-wc');
    render(<IdePanel />);

    // Create and open a file.
    fireEvent.click(screen.getByLabelText('New file'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'app.ts' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    // WC reports a change on that file.
    await act(async () => {
      capturedWatchListener?.('change', 'app.ts');
    });

    await waitFor(() => expect(mockReadFile).toHaveBeenCalledWith('app.ts'));
  });

  it('ignores changes inside node_modules', async () => {
    render(<IdePanel />);
    await act(async () => {
      capturedWatchListener?.('change', 'node_modules/some-pkg/index.js');
    });
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});

describe('IdePanel — terminal panel', () => {
  it('renders the Terminal component', () => {
    render(<IdePanel />);
    expect(screen.getByTestId('terminal')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd packages/frontend
npx vitest run src/components/IdePanel.test.tsx
```

Expected: new tests FAIL, existing tests PASS.

- [ ] **Step 3: Update IdePanel to add terminal + file sync**

Replace `packages/frontend/src/components/IdePanel.tsx` entirely:

```typescript
import { useEffect, useRef, useState } from 'react';
import { FileTree } from './FileTree.js';
import { TabBar } from './TabBar.js';
import { MonacoEditor } from './MonacoEditor.js';
import { Terminal } from './Terminal.js';
import { useWebContainer } from '../hooks/useWebContainer.js';
import { writeFile, readFile, watchFiles } from '../lib/webcontainer.js';

export function IdePanel() {
  const [files, setFiles] = useState<Record<string, string>>({});
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const { wc } = useWebContainer();
  // Keep a ref to avoid stale closure in the watch callback.
  const filesRef = useRef(files);
  filesRef.current = files;

  // Sync Monaco→WC on every file change.
  function handleChange(value: string) {
    if (activeTab === null) return;
    setFiles((prev) => ({ ...prev, [activeTab]: value }));
    void writeFile(activeTab, value);
  }

  // Watch WC filesystem and update Monaco state for changed files.
  useEffect(() => {
    if (!wc) return;
    let stopWatch: (() => void) | undefined;
    void watchFiles('/', async (event, filename) => {
      if (!filename || filename.startsWith('node_modules')) return;
      try {
        const content = await readFile(filename);
        setFiles((prev) => ({ ...prev, [filename]: content }));
      } catch {
        // File may have been deleted — ignore.
      }
    }).then((stop) => {
      stopWatch = stop;
    });
    return () => stopWatch?.();
  }, [wc]);

  function handleFileCreate(name: string) {
    setFiles((prev) => ({ ...prev, [name]: '' }));
    setOpenTabs((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setActiveTab(name);
    void writeFile(name, '');
  }

  function handleFileSelect(path: string) {
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveTab(path);
  }

  function handleFileDelete(path: string) {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setOpenTabs((prev) => {
      const idx = prev.indexOf(path);
      const next = prev.filter((t) => t !== path);
      if (activeTab === path) {
        setActiveTab(next[idx - 1] ?? next[idx] ?? null);
      }
      return next;
    });
  }

  function handleTabClose(path: string) {
    setOpenTabs((prev) => {
      const idx = prev.indexOf(path);
      const next = prev.filter((t) => t !== path);
      if (activeTab === path) {
        setActiveTab(next[idx - 1] ?? next[idx] ?? null);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-1 overflow-hidden min-h-0">
        <FileTree
          files={files}
          activeFile={activeTab}
          onFileSelect={handleFileSelect}
          onFileCreate={handleFileCreate}
          onFileDelete={handleFileDelete}
        />
        <div className="flex flex-col flex-1 overflow-hidden min-h-0">
          <TabBar
            tabs={openTabs}
            activeTab={activeTab}
            onTabSelect={setActiveTab}
            onTabClose={handleTabClose}
          />
          {/* Editor area */}
          <div className="flex-1 overflow-hidden min-h-0">
            {activeTab !== null ? (
              <MonacoEditor
                filePath={activeTab}
                content={files[activeTab] ?? ''}
                onChange={handleChange}
              />
            ) : (
              <div
                className="h-full flex flex-col items-center justify-center gap-2"
                style={{ background: '#0c0c0c', color: '#2a2a2a' }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.75" opacity={0.4}>
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="text-[11px]">Create a file to get started</span>
              </div>
            )}
          </div>
          {/* Terminal panel */}
          <div
            style={{
              height: 200,
              flexShrink: 0,
              borderTop: '1px solid #1e1e1e',
              overflow: 'hidden',
            }}
          >
            <Terminal wc={wc} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add mocks needed by existing IdePanel tests**

The existing IdePanel tests do not mock `useWebContainer`, `webcontainer`, or `Terminal`. Open `packages/frontend/src/components/IdePanel.test.tsx` and add these mocks at the **top of the file**, before the existing imports:

```typescript
import { vi } from 'vitest';

vi.mock('../hooks/useWebContainer.js', () => ({
  useWebContainer: () => ({ wc: null, ready: false, error: null }),
}));
vi.mock('../lib/webcontainer.js', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
  watchFiles: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock('./Terminal.js', () => ({
  Terminal: () => <div data-testid="terminal" />,
}));
```

- [ ] **Step 5: Run all IdePanel tests**

```bash
cd packages/frontend
npx vitest run src/components/IdePanel.test.tsx
```

Expected: all tests PASS (existing + new).

- [ ] **Step 6: Run full test suite**

```bash
cd packages/frontend
npm run test
```

Expected: all tests PASS.

- [ ] **Step 7: Typecheck**

```bash
cd packages/frontend
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/components/IdePanel.tsx packages/frontend/src/components/IdePanel.test.tsx
git commit -m "feat(frontend): wire Terminal + bidirectional WC/Monaco file sync into IdePanel (US-012)"
```

---

## Verification

After all tasks are complete, verify in the browser:

1. Start the dev server: `cd packages/frontend && npm run dev`
2. Open `http://localhost:5173` — the terminal panel should appear at the bottom of the IDE.
3. The browser console should have **no** errors about `SharedArrayBuffer` or COOP/COEP.
4. Create a file in the file tree (e.g., `index.js`) — the file should appear and be editable.
5. In the terminal, run `node index.js` — the node process should execute.
6. Run `npm init -y` — `package.json` should be created; it should appear in the Monaco file state if you open it via the file tree.
7. Edit a file in Monaco — the change should persist across terminal reloads.

---

## Self-Review Checklist

- [x] Spec coverage: boot on session start ✓ (Task 2/3), xterm terminal ✓ (Task 4), npm/node commands ✓ (jsh shell in Task 4), Monaco↔WC sync ✓ (Task 5), typecheck ✓ (every task), browser verify ✓ (Verification section).
- [x] No placeholders or TBDs.
- [x] Type signatures consistent: `writeFile(path, content)` used in Tasks 2, 5; `watchFiles(path, listener)` in Tasks 2, 5; `Terminal({ wc })` in Tasks 4, 5.
- [x] `resetForTests` exported in Task 2 and imported in Task 2 tests only.
- [x] CSS mock (`@xterm/xterm/css/xterm.css`) handled in Terminal tests.
