# US-007: Anthropic Native Agent Adapter — Design Spec

**Date:** 2026-03-28
**Status:** Approved

---

## Overview

Implement `AnthropicAdapter`, a native Anthropic Messages API adapter that satisfies the `AgentAdapter` interface defined in `@lintic/core`. Follows the same structural pattern as the existing `OpenAIAdapter` (raw `fetch`, no SDK dependency).

---

## File Changes

```
packages/adapters/src/
  tools.ts              NEW  shared TOOLS array + per-format converters
  openai-adapter.ts     MOD  import TOOLS from tools.ts (remove inline definition)
  anthropic-adapter.ts  NEW  AnthropicAdapter class
  anthropic-adapter.test.ts  NEW  unit tests (mocked fetch)
  index.ts              MOD  export AnthropicAdapter
```

---

## Shared Tools Module (`tools.ts`)

Exports:
- `TOOLS: ToolDefinition[]` — the 5 tool definitions (read_file, write_file, run_command, list_directory, search_files)
- `toOpenAITools(tools: ToolDefinition[]): OpenAITool[]` — formats for OpenAI function-calling
- `toAnthropicTools(tools: ToolDefinition[]): AnthropicTool[]` — formats for Anthropic tool use

Both `OpenAIAdapter` and `AnthropicAdapter` import from this module.

---

## `AnthropicAdapter` Design

### HTTP

- **URL:** `https://api.anthropic.com/v1/messages` (overridable via `config.base_url`)
- **Headers:** `x-api-key: <key>`, `anthropic-version: 2023-06-01`, `content-type: application/json`
- **Method:** POST

### Request Body

```ts
{
  model: string,
  max_tokens: context.constraints_remaining.tokens_remaining,
  messages: AnthropicMessage[],
  tools: AnthropicTool[],
}
```

### Message Format Conversion

| Canonical `Message`                  | Anthropic wire format |
|--------------------------------------|-----------------------|
| `user` text                          | `{ role: 'user', content: string }` |
| `assistant` text (no tool calls)     | `{ role: 'assistant', content: string }` |
| `assistant` with tool calls          | `{ role: 'assistant', content: [{ type: 'text', text }, { type: 'tool_use', id, name, input }] }` |
| `tool` result                        | `{ role: 'user', content: [{ type: 'tool_result', tool_use_id, content: string }] }` |

### Response Mapping

| Anthropic `stop_reason` | `AgentResponse.stop_reason` |
|------------------------|------------------------------|
| `'end_turn'`           | `'end_turn'`                 |
| `'tool_use'`           | `'tool_use'`                 |
| `'max_tokens'`         | `'max_tokens'`               |
| anything else          | `'end_turn'`                 |

Token usage: `input_tokens` → `prompt_tokens`, `output_tokens` → `completion_tokens`, sum → `total_tokens`.

### Error Handling

All errors are thrown as `AdapterError` (imported from `openai-adapter.ts`):

| Condition                        | `status` | `code`              |
|----------------------------------|----------|---------------------|
| `api_key` missing in `init()`    | 0        | `missing_api_key`   |
| `sendMessage` before `init()`    | 0        | `not_initialized`   |
| network failure                  | 0        | `network_error`     |
| HTTP `overloaded_error`          | 529      | `overloaded`        |
| HTTP `rate_limit_error`          | 429      | `rate_limited`      |
| other non-ok HTTP                | status   | error type or code  |
| empty `content` array            | 0        | `empty_response`    |

---

## Test Coverage (`anthropic-adapter.test.ts`)

Uses `vi.stubGlobal('fetch', ...)` — no real API calls.

- `init`: succeeds with valid config; rejects on missing `api_key`
- `sendMessage`: correct URL, headers, body; text response maps correctly; tool-use response maps to `tool_calls`; `finish_reason` variants map to correct `stop_reason`; non-ok HTTP throws `AdapterError`; `overloaded_error` → code `overloaded`; `rate_limit_error` → code `rate_limited`; network failure → code `network_error`; throws `not_initialized` before `init()`
- `getTokenUsage`: returns zeros before first call; returns usage from last call
- `getCapabilities`: returns `supports_tool_use: true`
- `getTools`: returns all 5 tools

---

## Quality Gates

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run test` passes (all new tests green)
