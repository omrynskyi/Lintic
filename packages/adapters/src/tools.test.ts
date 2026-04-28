import { describe, test, expect } from 'vitest';
import { TOOLS, toOpenAITools, toAnthropicTools } from './tools.js';

describe('TOOLS', () => {
  test('contains exactly 10 tool definitions', () => {
    expect(TOOLS).toHaveLength(10);
  });

  test('includes all expected tool names', () => {
    const names = TOOLS.map(t => t.name);
    expect(names).toContain('read_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('insert_in_file');
    expect(names).toContain('write_file');
    expect(names).toContain('run_command');
    expect(names).toContain('read_terminal_output');
    expect(names).toContain('list_processes');
    expect(names).toContain('kill_process');
    expect(names).toContain('list_directory');
    expect(names).toContain('search_files');
  });
});

describe('toOpenAITools', () => {
  test('wraps each tool as a function type', () => {
    const result = toOpenAITools(TOOLS);
    expect(result).toHaveLength(TOOLS.length);
    result.forEach(t => expect(t.type).toBe('function'));
  });

  test('maps name, description into function definition', () => {
    const [first] = toOpenAITools(TOOLS);
    expect(first!.function.name).toBe('read_file');
    expect(first!.function.description).toContain('Read');
  });

  test('wraps parameters under object schema', () => {
    const [first] = toOpenAITools(TOOLS);
    expect(first!.function.parameters.type).toBe('object');
    expect(first!.function.parameters.properties).toHaveProperty('path');
    expect(first!.function.parameters.required).toContain('path');
  });

  test('edit_file requires path, old_text, and new_text', () => {
    const tool = toOpenAITools(TOOLS).find((entry) => entry.function.name === 'edit_file');
    expect(tool?.function.parameters.required).toEqual(['path', 'old_text', 'new_text']);
  });

  test('insert_in_file requires path, anchor_text, new_text, and before_or_after', () => {
    const tool = toOpenAITools(TOOLS).find((entry) => entry.function.name === 'insert_in_file');
    expect(tool?.function.parameters.required).toEqual(['path', 'anchor_text', 'new_text', 'before_or_after']);
  });

  test('list_directory does not require path so models can default to cwd', () => {
    const tool = toOpenAITools(TOOLS).find((entry) => entry.function.name === 'list_directory');
    expect(tool?.function.parameters.required).not.toContain('path');
  });
});

describe('toAnthropicTools', () => {
  test('produces one entry per tool', () => {
    const result = toAnthropicTools(TOOLS);
    expect(result).toHaveLength(TOOLS.length);
  });

  test('maps name and description directly', () => {
    const [first] = toAnthropicTools(TOOLS);
    expect(first!.name).toBe('read_file');
    expect(first!.description).toContain('Read');
  });

  test('uses input_schema with object type', () => {
    const [first] = toAnthropicTools(TOOLS);
    expect(first!.input_schema.type).toBe('object');
    expect(first!.input_schema.properties).toHaveProperty('path');
    expect(first!.input_schema.required).toContain('path');
  });

  test('edit_file schema is exposed to Anthropic too', () => {
    const tool = toAnthropicTools(TOOLS).find((entry) => entry.name === 'edit_file');
    expect(tool?.input_schema.required).toEqual(['path', 'old_text', 'new_text']);
  });

  test('insert_in_file schema is exposed to Anthropic too', () => {
    const tool = toAnthropicTools(TOOLS).find((entry) => entry.name === 'insert_in_file');
    expect(tool?.input_schema.required).toEqual(['path', 'anchor_text', 'new_text', 'before_or_after']);
  });

  test('list_directory does not require path in Anthropic schema either', () => {
    const tool = toAnthropicTools(TOOLS).find((entry) => entry.name === 'list_directory');
    expect(tool?.input_schema.required).not.toContain('path');
  });
});
