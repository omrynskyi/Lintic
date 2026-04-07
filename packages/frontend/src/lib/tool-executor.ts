import type { ToolCall, ToolResult } from '@lintic/core';
import type { WebContainer } from '@webcontainer/api';

const FILE_TIMEOUT_MS = 5_000;
const COMMAND_TIMEOUT_MS = 300_000; // Used by search_files and other blocking subprocesses.
const DEFAULT_OUTPUT_CHARS = 4_000;

interface RunningProcess {
  id: string;
  command: string;
  output: string;
  status: 'running' | 'completed' | 'failed' | 'killed';
  startedAt: number;
  exitCode: number | null;
  outputReady: Promise<void>;
  kill?: () => void;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms),
    ),
  ]);
}

export class ToolExecutor {
  private readonly processes = new Map<string, RunningProcess>();
  private nextProcessId = 1;

  constructor(
    private wc: WebContainer,
    /** Optional callback — each output chunk is forwarded here (e.g. to the UI terminal). */
    private onOutput?: (chunk: string) => void,
  ) {}

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    try {
      const output = await this.dispatch(toolCall);
      return { tool_call_id: toolCall.id, name: toolCall.name, output, is_error: false };
    } catch (err) {
      return {
        tool_call_id: toolCall.id,
        name: toolCall.name,
        output: err instanceof Error ? err.message : String(err),
        is_error: true,
      };
    }
  }

  async executeAll(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map(tc => this.execute(tc)));
  }

  private dispatch(toolCall: ToolCall): Promise<string> {
    const { name, input } = toolCall;
    switch (name) {
      case 'read_file':
        return this.handleReadFile(input as { path: string });
      case 'write_file':
        return this.handleWriteFile(input as { path: string; content: string });
      case 'run_command':
        return this.handleRunCommand(input as { command: string });
      case 'read_terminal_output':
        return this.handleReadTerminalOutput(input as { process_id: string; max_chars?: number });
      case 'list_processes':
        return this.handleListProcesses();
      case 'kill_process':
        return this.handleKillProcess(input as { process_id: string });
      case 'list_directory':
        return this.handleListDirectory(input as { path?: string });
      case 'search_files':
        return this.handleSearchFiles(input as { pattern: string; path?: string });
      default:
        return Promise.reject(new Error(`Unknown tool: ${String(name)}`));
    }
  }

  /** Collect a ReadableStream<string> to a single string, forwarding chunks to onOutput. */
  private async collectStream(stream: ReadableStream<string>): Promise<string> {
    const chunks: string[] = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      this.onOutput?.(value);
    }
    return this.cleanOutput(chunks.join(''));
  }

  /**
   * Cleans terminal output by:
   * 1. Removing ANSI escape sequences (colors, cursor movement, etc).
   * 2. Handling orphaned sequences (like [1G or [0K) that may have lost the ESC character.
   * 3. Handling carriage returns (\r) by collapsing overwrites.
   */
  private cleanOutput(input: string): string {
    // 1. Remove ANSI escape sequences (standard ESC [... <char>)
    const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    let cleaned = input.replace(ansiRegex, '');

    // 2. Remove "orphaned" sequences that might be left over if ESC was stripped (e.g. [1G, [0K, [?25l)
    // This is more aggressive but helps with messy npm/node output.
    const orphanedRegex = /\[[0-9;]*[a-zA-Z]/g;
    cleaned = cleaned.replace(orphanedRegex, '');

    // 3. Handle carriage returns (\r)
    const lines = cleaned.split('\n');
    const processedLines = lines.map((line) => {
      if (!line.includes('\r')) return line;
      const segments = line.split('\r');
      return segments[segments.length - 1];
    });

    return processedLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n') // Collapse excessive newlines
      .trim();
  }

  private handleReadFile({ path }: { path: string }): Promise<string> {
    return withTimeout(this.wc.fs.readFile(path, 'utf-8'), FILE_TIMEOUT_MS, 'read_file');
  }

  private async handleWriteFile({ path, content }: { path: string; content: string }): Promise<string> {
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 1) {
      const parentDir = `${path.startsWith('/') ? '/' : ''}${segments.slice(0, -1).join('/')}`;
      await withTimeout(this.wc.fs.mkdir(parentDir, { recursive: true }), FILE_TIMEOUT_MS, 'write_file_mkdir');
    }
    await withTimeout(this.wc.fs.writeFile(path, content), FILE_TIMEOUT_MS, 'write_file');
    return 'ok';
  }

  private async handleRunCommand({ command }: { command: string }): Promise<string> {
    const [cmd, ...args] = command.split(' ');
    const process = await this.wc.spawn(cmd!, args, {
      env: {
        TERM: 'dumb',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      }
    });

    const processId = `proc-${this.nextProcessId++}`;
    const tracked: RunningProcess = {
      id: processId,
      command,
      output: '',
      status: 'running',
      startedAt: Date.now(),
      exitCode: null,
      outputReady: Promise.resolve(),
      kill: typeof process.kill === 'function' ? () => process.kill() : undefined,
    };
    this.processes.set(processId, tracked);

    this.onOutput?.(`\r\n\x1b[2m$ ${command}\x1b[0m\r\n`);

    tracked.outputReady = this.collectProcessOutput(tracked, process.output);
    void process.exit.then(async (exitCode) => {
      await tracked.outputReady;
      tracked.exitCode = exitCode;
      tracked.status = exitCode === 0 ? 'completed' : 'failed';
      this.onOutput?.(`\r\n\x1b[2m[process ${processId} exited with code ${exitCode}]\x1b[0m\r\n`);
    }).catch((error: unknown) => {
      tracked.status = 'failed';
      tracked.output += tracked.output ? `\n${String(error)}` : String(error);
    });

    return JSON.stringify({
      process_id: processId,
      command,
      status: tracked.status,
      message: 'Command started in terminal. Use read_terminal_output to inspect progress.',
    });
  }

  private handleReadTerminalOutput(
    { process_id, max_chars = DEFAULT_OUTPUT_CHARS }: { process_id: string; max_chars?: number },
  ): Promise<string> {
    const tracked = this.processes.get(process_id);
    if (!tracked) {
      throw new Error(`Unknown process: ${process_id}`);
    }

    const sliceLength = Math.max(1, Math.floor(max_chars));
    return Promise.resolve().then(() => JSON.stringify({
      process_id,
      command: tracked.command,
      status: tracked.status,
      exit_code: tracked.exitCode,
      output: this.formatTerminalOutput(tracked, sliceLength),
    }));
  }

  private handleListProcesses(): Promise<string> {
    return Promise.resolve(JSON.stringify({
      processes: Array.from(this.processes.values()).map((proc) => ({
        process_id: proc.id,
        command: proc.command,
        status: proc.status,
        exit_code: proc.exitCode,
        started_at: proc.startedAt,
      })),
    }));
  }

  private handleKillProcess({ process_id }: { process_id: string }): Promise<string> {
    const tracked = this.processes.get(process_id);
    if (!tracked) {
      throw new Error(`Unknown process: ${process_id}`);
    }

    tracked.kill?.();
    tracked.status = 'killed';
    tracked.exitCode = null;
    this.onOutput?.(`\r\n\x1b[2m[killed ${process_id}: ${tracked.command}]\x1b[0m\r\n`);

    return Promise.resolve(JSON.stringify({
      process_id,
      command: tracked.command,
      status: tracked.status,
    }));
  }

  private async handleListDirectory({ path = '.' }: { path?: string }): Promise<string> {
    const entries = await withTimeout(
      this.wc.fs.readdir(path, { withFileTypes: true }),
      FILE_TIMEOUT_MS,
      'list_directory',
    );
    return entries.map(e => (e.isDirectory() ? `${e.name}/` : e.name)).join('\n');
  }

  private async handleSearchFiles({ pattern, path = '.' }: { pattern: string; path?: string }): Promise<string> {
    const process = await this.wc.spawn('grep', ['-rl', pattern, path]);
    return withTimeout(this.collectStream(process.output), COMMAND_TIMEOUT_MS, 'search_files');
  }

  private async collectProcessOutput(streamOwner: RunningProcess, stream: ReadableStream<string>): Promise<void> {
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      streamOwner.output += value;
      this.onOutput?.(value);
    }
    streamOwner.output = this.cleanOutput(streamOwner.output);
  }

  private formatTerminalOutput(tracked: RunningProcess, sliceLength: number): string {
    const trimmedOutput = tracked.output.slice(-sliceLength);
    if (trimmedOutput) {
      return trimmedOutput;
    }

    if (tracked.status === 'running') {
      return 'No terminal output captured yet. The command may still be starting or may be running silently.';
    }

    return 'No terminal output was captured for this command.';
  }

  getRunningProcessIds(): string[] {
    return Array.from(this.processes.values())
      .filter((proc) => proc.status === 'running')
      .map((proc) => proc.id);
  }

  stopProcesses(processIds: string[]): void {
    for (const processId of processIds) {
      const tracked = this.processes.get(processId);
      if (!tracked || tracked.status !== 'running') {
        continue;
      }
      tracked.kill?.();
      tracked.status = 'killed';
      tracked.exitCode = null;
    }
  }
}
