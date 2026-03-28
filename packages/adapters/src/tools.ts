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
    description: 'Run a shell command and return stdout and stderr.',
    parameters: {
      command: { type: 'string', description: 'Shell command to execute.' },
    },
    required: ['command'],
  },
  {
    name: 'list_directory',
    description: 'List the files and directories at a given path.',
    parameters: {
      path: { type: 'string', description: 'Path to the directory to list.' },
    },
    required: ['path'],
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
