import type { ToolCall, ToolResult } from '@lintic/core';
import type { WebContainer } from '@webcontainer/api';

const FILE_TIMEOUT_MS = 5_000;
const COMMAND_TIMEOUT_MS = 300_000; // 5 minutes — covers npm install and similar long-running commands

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms),
    ),
  ]);
}

export class ToolExecutor {
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
      case 'list_directory':
        return this.handleListDirectory(input as { path: string });
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
    await withTimeout(this.wc.fs.writeFile(path, content), FILE_TIMEOUT_MS, 'write_file');
    return 'ok';
  }

  private async handleRunCommand({ command }: { command: string }): Promise<string> {
    const [cmd, ...args] = command.split(' ');
    // Set TERM=dumb and NO_COLOR=1 to minimize escape sequences from tools.
    const process = await this.wc.spawn(cmd!, args, {
      env: {
        TERM: 'dumb',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      }
    });
    // Echo the command to the terminal so the user can see what the agent is running.
    this.onOutput?.(`\r\n\x1b[2m$ ${command}\x1b[0m\r\n`);
    return withTimeout(this.collectStream(process.output), COMMAND_TIMEOUT_MS, 'run_command');
  }

  private async handleListDirectory({ path }: { path: string }): Promise<string> {
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
}
