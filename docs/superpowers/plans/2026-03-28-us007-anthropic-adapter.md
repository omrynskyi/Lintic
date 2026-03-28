# US-007: Anthropic Native Agent Adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `AnthropicAdapter` — a native Anthropic Messages API adapter satisfying the `AgentAdapter` interface — and extract shared tool definitions into a common module used by both adapters.

**Architecture:** Extract the `TOOLS` array and format converters (`toOpenAITools`, `toAnthropicTools`) into `packages/adapters/src/tools.ts`. `OpenAIAdapter` imports from there instead of defining them inline. `AnthropicAdapter` follows the same fetch-based, no-SDK pattern as `OpenAIAdapter`, handling Anthropic's distinct message format and error codes.

**Tech Stack:** TypeScript, Vitest, raw `fetch`, `@lintic/core` types (`AgentAdapter`, `ToolDefinition`, `AgentResponse`, etc.)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/adapters/src/tools.ts` | **Create** | Shared `TOOLS` array + `toOpenAITools` + `toAnthropicTools` |
| `packages/adapters/src/openai-adapter.ts` | **Modify** | Remove inline `TOOLS`/`toOpenAITools`; import from `tools.ts` |
| `packages/adapters/src/anthropic-adapter.ts` | **Create** | `AnthropicAdapter` class |
| `packages/adapters/src/anthropic-adapter.test.ts` | **Create** | Unit tests with mocked fetch |
| `packages/adapters/src/index.ts` | **Modify** | Export `AnthropicAdapter` |
| `PRD.md` | **Modify** | Mark US-007 criteria as `[x]` |

---

## Task 1: Create shared tools module

**Files:**
- Create: `packages/adapters/src/tools.ts`

- [ ] **Step 1: Create `tools.ts`**

```typescript
import type { ToolDefinition } from '@lintic/core';

// ─── OpenAI tool wire format ──────────────────────────────────────────────────

interface OpenAIToolFunctionDef {
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
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

---

## Task 2: Update OpenAIAdapter to use shared tools module

**Files:**
- Modify: `packages/adapters/src/openai-adapter.ts`

- [ ] **Step 1: Replace the inline TOOLS, OpenAITool, OpenAIToolFunctionDef, and toOpenAITools in `openai-adapter.ts`**

Remove lines 35–48 (the `OpenAIToolFunctionDef` and `OpenAITool` interfaces), lines 91–134 (the `TOOLS` array), and lines 291–304 (the `toOpenAITools` function).

Add this import after the existing `from '@lintic/core'` import:

```typescript
import { TOOLS, toOpenAITools } from './tools.js';
```

The file after editing should start like this:

```typescript
import type {
  AgentAdapter,
  AgentCapabilities,
  AgentConfig,
  AgentResponse,
  Message,
  SessionContext,
  ToolCall,
  ToolDefinition,
  ToolName,
  TokenUsage,
} from '@lintic/core';
import { TOOLS, toOpenAITools } from './tools.js';

// ─── Internal OpenAI wire types ───────────────────────────────────────────────

interface OpenAIToolCallFunction {
  name: string;
  arguments: string; // JSON-encoded
}
// ... (rest of file unchanged except removal of TOOLS, OpenAITool, OpenAIToolFunctionDef, toOpenAITools)
```

- [ ] **Step 2: Run typecheck and tests to confirm nothing broke**

```bash
npm run typecheck && npm run test
```

Expected: all 102 tests pass, no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/tools.ts packages/adapters/src/openai-adapter.ts
git commit -m "refactor(adapters): extract shared TOOLS and format converters to tools.ts"
```

---

## Task 3: Write failing tests for AnthropicAdapter

**Files:**
- Create: `packages/adapters/src/anthropic-adapter.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { AdapterError } from './openai-adapter.js';
import type { AgentConfig, SessionContext } from '@lintic/core';

const VALID_CONFIG: AgentConfig = {
  provider: 'anthropic-native',
  api_key: 'sk-ant-test',
  model: 'claude-3-5-sonnet-20241022',
};

function makeContext(overrides?: Partial<SessionContext>): SessionContext {
  return {
    session_id: 'test-session',
    history: [],
    constraints_remaining: {
      tokens_remaining: 4096,
      interactions_remaining: 10,
      seconds_remaining: 3600,
    },
    ...overrides,
  };
}

function makeTextResponse(text: string, stopReason = 'end_turn') {
  return {
    content: [{ type: 'text', text }],
    stop_reason: stopReason,
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function makeToolUseResponse(id: string, name: string, input: Record<string, unknown>) {
  return {
    content: [
      { type: 'text', text: 'I will use a tool.' },
      { type: 'tool_use', id, name, input },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 20, output_tokens: 10 },
  };
}

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    adapter = new AnthropicAdapter();
    vi.restoreAllMocks();
  });

  // ── init ──────────────────────────────────────────────────────────────────

  describe('init', () => {
    test('succeeds with valid config', async () => {
      await expect(adapter.init(VALID_CONFIG)).resolves.toBeUndefined();
    });

    test('throws AdapterError when api_key is empty', async () => {
      await expect(
        adapter.init({ ...VALID_CONFIG, api_key: '' }),
      ).rejects.toMatchObject({ code: 'missing_api_key' });
    });

    test('throws an instance of AdapterError', async () => {
      await expect(
        adapter.init({ ...VALID_CONFIG, api_key: '' }),
      ).rejects.toBeInstanceOf(AdapterError);
    });
  });

  // ── sendMessage ───────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    beforeEach(async () => {
      await adapter.init(VALID_CONFIG);
    });

    test('POSTs to /v1/messages with correct URL', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTextResponse('Hello!')),
      });
      vi.stubGlobal('fetch', fetchMock);

      await adapter.sendMessage('Hi', makeContext());

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
    });

    test('sends correct Anthropic headers', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTextResponse('Hello!')),
      });
      vi.stubGlobal('fetch', fetchMock);

      await adapter.sendMessage('Hi', makeContext());

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('sk-ant-test');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['content-type']).toBe('application/json');
    });

    test('uses base_url override when provided', async () => {
      const custom = new AnthropicAdapter();
      await custom.init({ ...VALID_CONFIG, base_url: 'https://custom.anthropic.com' });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTextResponse('Hi')),
      });
      vi.stubGlobal('fetch', fetchMock);

      await custom.sendMessage('Hi', makeContext());

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://custom.anthropic.com/v1/messages');
    });

    test('returns AgentResponse with text content', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTextResponse('Hello!')),
      }));

      const response = await adapter.sendMessage('Hi', makeContext());

      expect(response.content).toBe('Hello!');
      expect(response.stop_reason).toBe('end_turn');
      expect(response.tool_calls).toBeUndefined();
    });

    test('maps stop_reason tool_use to tool_use', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(
          makeToolUseResponse('toolu_01', 'read_file', { path: 'src/index.ts' }),
        ),
      }));

      const response = await adapter.sendMessage('Read it', makeContext());

      expect(response.stop_reason).toBe('tool_use');
      expect(response.tool_calls).toHaveLength(1);
      expect(response.tool_calls![0]).toMatchObject({
        id: 'toolu_01',
        name: 'read_file',
        input: { path: 'src/index.ts' },
      });
    });

    test('maps stop_reason max_tokens to max_tokens', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTextResponse('Truncated', 'max_tokens')),
      }));

      const response = await adapter.sendMessage('Hi', makeContext());

      expect(response.stop_reason).toBe('max_tokens');
    });

    test('does not include tool_calls field when response has none', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTextResponse('Plain text')),
      }));

      const response = await adapter.sendMessage('Hi', makeContext());

      expect(Object.prototype.hasOwnProperty.call(response, 'tool_calls')).toBe(false);
    });

    test('throws AdapterError on non-ok HTTP response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { type: 'invalid_request_error', message: 'Bad request' } }),
      }));

      await expect(adapter.sendMessage('Hi', makeContext())).rejects.toMatchObject({
        status: 400,
        code: 'invalid_request_error',
      });
    });

    test('maps overloaded_error to code overloaded', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 529,
        json: () => Promise.resolve({ error: { type: 'overloaded_error', message: 'Overloaded' } }),
      }));

      await expect(adapter.sendMessage('Hi', makeContext())).rejects.toMatchObject({
        code: 'overloaded',
      });
    });

    test('maps rate_limit_error to code rate_limited', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { type: 'rate_limit_error', message: 'Rate limited' } }),
      }));

      await expect(adapter.sendMessage('Hi', makeContext())).rejects.toMatchObject({
        code: 'rate_limited',
      });
    });

    test('throws AdapterError with network_error on fetch failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      await expect(adapter.sendMessage('Hi', makeContext())).rejects.toMatchObject({
        code: 'network_error',
      });
    });

    test('throws not_initialized when called before init()', async () => {
      const fresh = new AnthropicAdapter();
      await expect(fresh.sendMessage('Hi', makeContext())).rejects.toMatchObject({
        code: 'not_initialized',
      });
    });

    test('passes tokens_remaining as max_tokens in request body', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTextResponse('OK')),
      });
      vi.stubGlobal('fetch', fetchMock);

      await adapter.sendMessage('Hi', makeContext({ constraints_remaining: { tokens_remaining: 512, interactions_remaining: 5, seconds_remaining: 100 } }));

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as { max_tokens: number };
      expect(body.max_tokens).toBe(512);
    });
  });

  // ── getTokenUsage ─────────────────────────────────────────────────────────

  describe('getTokenUsage', () => {
    test('returns zeros before any sendMessage call', async () => {
      await adapter.init(VALID_CONFIG);
      expect(adapter.getTokenUsage()).toEqual({
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      });
    });

    test('returns usage from last sendMessage call', async () => {
      await adapter.init(VALID_CONFIG);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTextResponse('Hi')),
      }));

      await adapter.sendMessage('Hi', makeContext());

      // makeTextResponse uses input_tokens: 10, output_tokens: 5
      expect(adapter.getTokenUsage()).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
    });
  });

  // ── getCapabilities ───────────────────────────────────────────────────────

  describe('getCapabilities', () => {
    test('reports system prompt and tool use support', async () => {
      await adapter.init(VALID_CONFIG);
      const caps = adapter.getCapabilities();
      expect(caps.supports_system_prompt).toBe(true);
      expect(caps.supports_tool_use).toBe(true);
    });

    test('reports max_context_window of 200000', async () => {
      await adapter.init(VALID_CONFIG);
      expect(adapter.getCapabilities().max_context_window).toBe(200000);
    });
  });

  // ── getTools ──────────────────────────────────────────────────────────────

  describe('getTools', () => {
    test('returns all 5 tool definitions', async () => {
      await adapter.init(VALID_CONFIG);
      const tools = adapter.getTools();
      expect(tools).toHaveLength(5);
      const names = tools.map(t => t.name);
      expect(names).toContain('read_file');
      expect(names).toContain('write_file');
      expect(names).toContain('run_command');
      expect(names).toContain('list_directory');
      expect(names).toContain('search_files');
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail with "cannot find module"**

```bash
npm run test 2>&1 | grep -E "FAIL|Cannot find|Error"
```

Expected: error mentioning `anthropic-adapter.js` not found.

---

## Task 4: Implement AnthropicAdapter

**Files:**
- Create: `packages/adapters/src/anthropic-adapter.ts`

- [ ] **Step 1: Create `anthropic-adapter.ts`**

```typescript
import type {
  AgentAdapter,
  AgentCapabilities,
  AgentConfig,
  AgentResponse,
  Message,
  SessionContext,
  ToolCall,
  ToolDefinition,
  ToolName,
  TokenUsage,
} from '@lintic/core';
import { AdapterError } from './openai-adapter.js';
import { TOOLS, toAnthropicTools } from './tools.js';

// ─── Anthropic wire types ─────────────────────────────────────────────────────

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicErrorBody {
  error?: {
    type?: string;
    message?: string;
  };
}

// ─── AnthropicAdapter ─────────────────────────────────────────────────────────

export class AnthropicAdapter implements AgentAdapter {
  private config: AgentConfig | null = null;
  private baseUrl: string = 'https://api.anthropic.com';
  private lastUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  init(config: AgentConfig): Promise<void> {
    if (!config.api_key) {
      return Promise.reject(new AdapterError('AnthropicAdapter: api_key is required', 0, 'missing_api_key'));
    }
    this.config = config;
    this.baseUrl = (config.base_url ?? 'https://api.anthropic.com').replace(/\/$/, '');
    return Promise.resolve();
  }

  async sendMessage(msg: string, context: SessionContext): Promise<AgentResponse> {
    if (!this.config) {
      throw new AdapterError('AnthropicAdapter: call init() before sendMessage()', 0, 'not_initialized');
    }

    const messages: AnthropicMessage[] = [
      ...context.history.map(toAnthropicMessage),
      { role: 'user', content: msg },
    ];

    const requestBody = {
      model: this.config.model,
      max_tokens: context.constraints_remaining.tokens_remaining,
      messages,
      tools: toAnthropicTools(TOOLS),
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      throw new AdapterError(
        `AnthropicAdapter: network error – ${err instanceof Error ? err.message : String(err)}`,
        0,
        'network_error',
      );
    }

    if (!response.ok) {
      let errMessage = `HTTP ${response.status}`;
      let errCode = String(response.status);
      try {
        const body = (await response.json()) as AnthropicErrorBody;
        if (body.error?.message) errMessage = body.error.message;
        if (body.error?.type) {
          errCode =
            body.error.type === 'overloaded_error' ? 'overloaded'
            : body.error.type === 'rate_limit_error' ? 'rate_limited'
            : body.error.type;
        }
      } catch {
        // ignore JSON parse failure
      }
      throw new AdapterError(errMessage, response.status, errCode);
    }

    const data = (await response.json()) as AnthropicResponse;

    if (!data.content || data.content.length === 0) {
      throw new AdapterError('AnthropicAdapter: empty content in response', 0, 'empty_response');
    }

    this.lastUsage = {
      prompt_tokens: data.usage.input_tokens,
      completion_tokens: data.usage.output_tokens,
      total_tokens: data.usage.input_tokens + data.usage.output_tokens,
    };

    const textBlock = data.content.find((b): b is AnthropicTextBlock => b.type === 'text');
    const toolUseBlocks = data.content.filter((b): b is AnthropicToolUseBlock => b.type === 'tool_use');

    const toolCalls: ToolCall[] = toolUseBlocks.map(b => ({
      id: b.id,
      name: b.name as ToolName,
      input: b.input,
    }));

    const agentResponse: AgentResponse = {
      content: textBlock?.text ?? null,
      usage: this.lastUsage,
      stop_reason: mapStopReason(data.stop_reason),
    };
    if (toolCalls.length > 0) {
      agentResponse.tool_calls = toolCalls;
    }
    return agentResponse;
  }

  getTokenUsage(): TokenUsage {
    return { ...this.lastUsage };
  }

  getCapabilities(): AgentCapabilities {
    return {
      supports_system_prompt: true,
      supports_tool_use: true,
      max_context_window: 200000,
    };
  }

  getTools(): ToolDefinition[] {
    return TOOLS;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toAnthropicMessage(msg: Message): AnthropicMessage {
  if (msg.role === 'tool') {
    const result = msg.tool_results?.[0];
    return {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: result?.tool_call_id ?? '',
        content: result?.output ?? '',
      }],
    };
  }

  if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
    const blocks: AnthropicContentBlock[] = [];
    if (msg.content) {
      blocks.push({ type: 'text', text: msg.content });
    }
    for (const tc of msg.tool_calls) {
      blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
    return { role: 'assistant', content: blocks };
  }

  return {
    role: msg.role as 'user' | 'assistant',
    content: msg.content ?? '',
  };
}

function mapStopReason(reason: string): AgentResponse['stop_reason'] {
  if (reason === 'tool_use') return 'tool_use';
  if (reason === 'max_tokens') return 'max_tokens';
  return 'end_turn';
}
```

- [ ] **Step 2: Run tests — all should pass**

```bash
npm run test 2>&1 | tail -10
```

Expected: `Test Files  6 passed`, all tests green including the new `anthropic-adapter.test.ts`.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/anthropic-adapter.ts packages/adapters/src/anthropic-adapter.test.ts
git commit -m "feat(adapters): implement US-007 Anthropic native agent adapter"
```

---

## Task 5: Update exports and PRD

**Files:**
- Modify: `packages/adapters/src/index.ts`
- Modify: `PRD.md`

- [ ] **Step 1: Add `AnthropicAdapter` to `index.ts`**

Replace the contents of `packages/adapters/src/index.ts` with:

```typescript
export const VERSION: string = '0.0.1';
export { OpenAIAdapter, AdapterError } from './openai-adapter.js';
export { AnthropicAdapter } from './anthropic-adapter.js';
```

- [ ] **Step 2: Mark US-007 criteria as done in `PRD.md`**

Find the US-007 acceptance criteria block and change all `- [ ]` to `- [x]`:

```markdown
**Acceptance Criteria:**
- [x] Implements AgentAdapter interface
- [x] Posts to Anthropic Messages API (/v1/messages) with correct headers
- [x] Maps conversation history to Anthropic's message format
- [x] Handles Anthropic-specific error codes (overloaded, rate_limited)
- [x] Unit tests with mocked HTTP responses
- [x] Typecheck passes
```

- [ ] **Step 3: Run full quality gates**

```bash
npm run typecheck && npm run lint && npm run test
```

Expected: typecheck clean, lint clean, all tests pass (should be 123 total: 102 existing + 21 new).

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/index.ts PRD.md
git commit -m "feat(adapters): export AnthropicAdapter; mark US-007 complete in PRD"
```
