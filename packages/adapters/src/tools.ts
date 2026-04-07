import type { ToolDefinition } from '@lintic/core';

// ─── OpenAI tool wire format ──────────────────────────────────────────────────

export interface OpenAIToolFunctionDef {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export interface OpenAITool {
  type: 'function';
  function: OpenAIToolFunctionDef;
}

// ─── Anthropic tool wire format ───────────────────────────────────────────────

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

// ─── Shared tool definitions ──────────────────────────────────────────────────

export const TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the given path.',
    parameters: {
      path: { type: 'string', description: 'Absolute or relative path to the file.' },
    },
    required: ['path'],
  },
  {
    name: 'write_file',
    description: 'Write content to a file, creating it if it does not exist.',
    parameters: {
      path: { type: 'string', description: 'Path to the file to write.' },
      content: { type: 'string', description: 'Content to write to the file.' },
    },
    required: ['path', 'content'],
  },
  {
    name: 'run_command',
    description: 'Start a shell command in the terminal without blocking. Returns a process id you can inspect later.',
    parameters: {
      command: { type: 'string', description: 'Shell command to execute.' },
    },
    required: ['command'],
  },
  {
    name: 'read_terminal_output',
    description: 'Read the latest captured terminal output for a running or completed process.',
    parameters: {
      process_id: { type: 'string', description: 'Process id returned by run_command.' },
      max_chars: { type: 'number', description: 'Maximum number of trailing characters to return.' },
    },
    required: ['process_id'],
  },
  {
    name: 'list_processes',
    description: 'List tracked terminal processes and their current status.',
    parameters: {},
    required: [],
  },
  {
    name: 'kill_process',
    description: 'Terminate a tracked terminal process by id.',
    parameters: {
      process_id: { type: 'string', description: 'Process id returned by run_command.' },
    },
    required: ['process_id'],
  },
  {
    name: 'list_directory',
    description: 'List the files and directories at a given path.',
    parameters: {
      path: { type: 'string', description: 'Path to the directory to list.' },
    },
    required: [],
  },
  {
    name: 'search_files',
    description: 'Search for files matching a pattern or containing a given string.',
    parameters: {
      pattern: { type: 'string', description: 'Glob or regex pattern to search for.' },
      path: { type: 'string', description: 'Directory to search within.' },
    },
    required: ['pattern'],
  },
];

// ─── Format converters ────────────────────────────────────────────────────────

export function toOpenAITools(tools: ToolDefinition[]): OpenAITool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object' as const,
        properties: t.parameters,
        required: t.required,
      },
    },
  }));
}

export function toAnthropicTools(tools: ToolDefinition[]): AnthropicTool[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: t.parameters,
      required: t.required,
    },
  }));
}
