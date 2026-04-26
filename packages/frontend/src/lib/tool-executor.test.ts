import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ToolExecutor } from './tool-executor.js';
import type { ToolCall } from '@lintic/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProcess(output: string, exitCode = 0) {
  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(output);
      controller.close();
    },
  });
  return { output: stream, exit: Promise.resolve(exitCode), input: {} as WritableStream<string>, kill: vi.fn() };
}

function toolCall(overrides: Partial<ToolCall> & Pick<ToolCall, 'name' | 'input'>): ToolCall {
  return { id: 'tc-1', ...overrides };
}

// ─── Mock WebContainer ────────────────────────────────────────────────────────

const mockFs = {
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
};

const mockWc = {
  fs: mockFs,
  spawn: vi.fn(),
};

const commandEnv = {
  env: {
    TERM: 'dumb',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ToolExecutor', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    executor = new ToolExecutor(mockWc as any);
  });

  // ── read_file ──────────────────────────────────────────────────────────────

  describe('read_file', () => {
    test('returns file content on success', async () => {
      mockFs.readFile.mockResolvedValue('hello world');
      const result = await executor.execute(toolCall({ name: 'read_file', input: { path: '/app/index.ts' } }));
      expect(result).toEqual({ tool_call_id: 'tc-1', name: 'read_file', output: 'hello world', is_error: false });
      expect(mockFs.readFile).toHaveBeenCalledWith('/app/index.ts', 'utf-8');
    });

    test('returns error result when readFile throws', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      const result = await executor.execute(toolCall({ name: 'read_file', input: { path: '/missing.ts' } }));
      expect(result.is_error).toBe(true);
      expect(result.output).toContain('File not found');
    });

    test('returns error result on timeout', async () => {
      vi.useFakeTimers();
      mockFs.readFile.mockReturnValue(new Promise(() => { /* never resolves */ }));
      const promise = executor.execute(toolCall({ name: 'read_file', input: { path: '/slow.ts' } }));
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.is_error).toBe(true);
      expect(result.output).toMatch(/Timeout/i);
      vi.useRealTimers();
    });
  });

  // ── write_file ─────────────────────────────────────────────────────────────

  describe('write_file', () => {
    test('returns "ok" on success', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      const result = await executor.execute(toolCall({ name: 'write_file', input: { path: '/app/out.ts', content: 'const x = 1;' } }));
      expect(result).toEqual({ tool_call_id: 'tc-1', name: 'write_file', output: 'ok', is_error: false });
      expect(mockFs.mkdir).toHaveBeenCalledWith('/app', { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith('/app/out.ts', 'const x = 1;');
    });

    test('returns error result when writeFile throws', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));
      const result = await executor.execute(toolCall({ name: 'write_file', input: { path: '/readonly.ts', content: 'x' } }));
      expect(result.is_error).toBe(true);
      expect(result.output).toContain('Permission denied');
    });
  });

  // ── run_command ────────────────────────────────────────────────────────────

  describe('run_command', () => {
    test('starts command and returns a process id immediately', async () => {
      mockWc.spawn.mockResolvedValue(makeProcess('build success\n'));
      const result = await executor.execute(toolCall({ name: 'run_command', input: { command: 'npm run build' } }));
      expect(result.is_error).toBe(false);
      expect(result.output).toContain('"process_id":"proc-1"');
      expect(result.output).toContain('"status":"running"');
      expect(mockWc.spawn).toHaveBeenCalledWith('sh', ['-lc', 'npm run build'], commandEnv);
    });

    test('passes chained shell commands through the shell wrapper', async () => {
      mockWc.spawn.mockResolvedValue(makeProcess(''));
      await executor.execute(toolCall({ name: 'run_command', input: { command: 'npm init -y && npm install express' } }));
      expect(mockWc.spawn).toHaveBeenCalledWith('sh', ['-lc', 'npm init -y && npm install express'], commandEnv);
    });

    test('list_processes and read_terminal_output expose running command state', async () => {
      mockWc.spawn.mockResolvedValue(makeProcess('server booted\n'));
      await executor.execute(toolCall({ name: 'run_command', input: { command: 'node server.js' } }));

      const listResult = await executor.execute(toolCall({ name: 'list_processes', input: {} }));
      expect(listResult.output).toContain('"process_id":"proc-1"');
      expect(listResult.output).toContain('"command":"node server.js"');

      const outputResult = await executor.execute(
        toolCall({ name: 'read_terminal_output', input: { process_id: 'proc-1' } }),
      );
      expect(outputResult.output).toContain('"process_id":"proc-1"');
      expect(outputResult.output).toContain('server booted');
    });

    test('read_terminal_output can page from an explicit offset', async () => {
      mockWc.spawn.mockResolvedValue(makeProcess('abcdefghij'));
      await executor.execute(toolCall({ name: 'run_command', input: { command: 'node server.js' } }));

      const outputResult = await executor.execute(
        toolCall({ name: 'read_terminal_output', input: { process_id: 'proc-1', offset: 2, max_chars: 4 } }),
      );

      expect(outputResult.output).toContain('"process_id":"proc-1"');
      expect(outputResult.output).toContain('"offset":2');
      expect(outputResult.output).toContain('"max_chars":4');
      expect(outputResult.output).toContain('"returned_chars":4');
      expect(outputResult.output).toContain('"has_more":true');
      expect(outputResult.output).toContain('"output":"cdef"');
    });

    test('read_terminal_output includes stderr/stdout after a failed process exits', async () => {
      mockWc.spawn.mockResolvedValue(makeProcess("Error: Cannot find module 'express'\n", 1));
      await executor.execute(toolCall({ name: 'run_command', input: { command: 'node library.js' } }));

      await Promise.resolve();

      const outputResult = await executor.execute(
        toolCall({ name: 'read_terminal_output', input: { process_id: 'proc-1' } }),
      );
      expect(outputResult.output).toContain('"status":"failed"');
      expect(outputResult.output).toContain(`Cannot find module 'express'`);
    });

    test('read_terminal_output returns a helpful message when no output has been captured yet', async () => {
      mockWc.spawn.mockResolvedValue(makeProcess(''));
      await executor.execute(toolCall({ name: 'run_command', input: { command: 'npm init -y' } }));

      const outputResult = await executor.execute(
        toolCall({ name: 'read_terminal_output', input: { process_id: 'proc-1' } }),
      );

      expect(outputResult.output).toContain('"process_id":"proc-1"');
      expect(outputResult.output).toContain('No terminal output');
    });

    test('kill_process terminates a tracked command', async () => {
      const proc = makeProcess('watching\n');
      mockWc.spawn.mockResolvedValue(proc);
      await executor.execute(toolCall({ name: 'run_command', input: { command: 'npm run dev' } }));

      const killResult = await executor.execute(
        toolCall({ name: 'kill_process', input: { process_id: 'proc-1' } }),
      );

      expect(proc.kill).toHaveBeenCalled();
      expect(killResult.output).toContain('"status":"killed"');
    });
  });

  // ── list_directory ─────────────────────────────────────────────────────────

  describe('list_directory', () => {
    test('lists entries, suffixing directories with /', async () => {
      mockFs.readdir.mockResolvedValue([
        { name: 'src', isDirectory: () => true, isFile: () => false },
        { name: 'package.json', isDirectory: () => false, isFile: () => true },
        { name: 'tsconfig.json', isDirectory: () => false, isFile: () => true },
      ]);
      const result = await executor.execute(toolCall({ name: 'list_directory', input: { path: '/app' } }));
      expect(result.is_error).toBe(false);
      expect(result.output).toBe('src/\npackage.json\ntsconfig.json');
      expect(mockFs.readdir).toHaveBeenCalledWith('/app', { withFileTypes: true });
    });

    test('returns error result when readdir throws', async () => {
      mockFs.readdir.mockRejectedValue(new Error('No such directory'));
      const result = await executor.execute(toolCall({ name: 'list_directory', input: { path: '/nope' } }));
      expect(result.is_error).toBe(true);
      expect(result.output).toContain('No such directory');
    });

    test('defaults path to current directory when omitted', async () => {
      mockFs.readdir.mockResolvedValue([
        { name: 'package.json', isDirectory: () => false, isFile: () => true },
      ]);
      const result = await executor.execute(toolCall({ name: 'list_directory', input: {} }));
      expect(result.is_error).toBe(false);
      expect(result.output).toBe('package.json');
      expect(mockFs.readdir).toHaveBeenCalledWith('.', { withFileTypes: true });
    });
  });

  // ── search_files ───────────────────────────────────────────────────────────

  describe('search_files', () => {
    test('spawns grep with pattern and path', async () => {
      mockWc.spawn.mockResolvedValue(makeProcess('src/foo.ts\nsrc/bar.ts\n'));
      const result = await executor.execute(toolCall({ name: 'search_files', input: { pattern: 'useState', path: 'src' } }));
      expect(result.is_error).toBe(false);
      expect(result.output).toBe('src/foo.ts\nsrc/bar.ts');
      expect(mockWc.spawn).toHaveBeenCalledWith('grep', ['-rl', 'useState', 'src']);
    });

    test('defaults path to "." when omitted', async () => {
      mockWc.spawn.mockResolvedValue(makeProcess('index.ts\n'));
      await executor.execute(toolCall({ name: 'search_files', input: { pattern: 'TODO' } }));
      expect(mockWc.spawn).toHaveBeenCalledWith('grep', ['-rl', 'TODO', '.']);
    });
  });

  // ── unknown tool ───────────────────────────────────────────────────────────

  describe('unknown tool', () => {
    test('returns error result for unrecognised tool name', async () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const badCall = toolCall({ name: 'delete_everything' as any, input: {} });
      const result = await executor.execute(badCall);
      expect(result.is_error).toBe(true);
      expect(result.output).toContain('Unknown tool');
    });
  });

  // ── executeAll ─────────────────────────────────────────────────────────────

  describe('executeAll', () => {
    test('returns one result per call in order', async () => {
      mockFs.readFile
        .mockResolvedValueOnce('content-a')
        .mockResolvedValueOnce('content-b');

      const calls: ToolCall[] = [
        { id: 'a', name: 'read_file', input: { path: '/a.ts' } },
        { id: 'b', name: 'read_file', input: { path: '/b.ts' } },
      ];
      const results = await executor.executeAll(calls);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ tool_call_id: 'a', output: 'content-a', is_error: false });
      expect(results[1]).toMatchObject({ tool_call_id: 'b', output: 'content-b', is_error: false });
    });

    test('preserves order even when individual calls have errors', async () => {
      mockFs.readFile
        .mockRejectedValueOnce(new Error('oops'))
        .mockResolvedValueOnce('ok');

      const calls: ToolCall[] = [
        { id: '1', name: 'read_file', input: { path: '/bad.ts' } },
        { id: '2', name: 'read_file', input: { path: '/good.ts' } },
      ];
      const results = await executor.executeAll(calls);
      expect(results[0]!.is_error).toBe(true);
      expect(results[1]!.is_error).toBe(false);
    });
  });
});
