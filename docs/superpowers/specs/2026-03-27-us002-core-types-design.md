# US-002: Core Session Data Models and Types

**Date:** 2026-03-27
**Status:** Approved
**File:** `packages/core/src/types.ts`

## Context

All packages (`core`, `adapters`, `frontend`, `cli`) share a single set of TypeScript types. These types are the contract between every layer of the system. US-002 defines them up-front so that US-003 through US-028 can import from `@lintic/core` without circular dependencies or type drift.

## Architecture Decision: Single File

All types live in `packages/core/src/types.ts` and are re-exported from `packages/core/src/index.ts`. No domain-split files at this stage — the total type count is small and one file makes imports predictable.

## Type Definitions

### Constraints

```ts
interface Constraint {
  max_session_tokens: number;
  max_message_tokens: number;
  max_interactions: number;
  context_window: number;
  time_limit_minutes: number;
}

interface ConstraintsRemaining {
  tokens_remaining: number;
  interactions_remaining: number;
  seconds_remaining: number;
}
```

### Agent Configuration

```ts
// 'groq' is explicit — it uses the openai-compatible adapter internally
// but allows the backend to auto-set Groq's base_url as a convenience.
type AgentProvider = 'openai-compatible' | 'anthropic-native' | 'groq';

interface AgentConfig {
  provider: AgentProvider;
  base_url?: string;   // optional for anthropic-native and groq (has default)
  api_key: string;
  model: string;
}
```

### Messages and Conversation History

`SessionContext` carries the full conversation history into `sendMessage` so adapters are stateless and testable without DB access.

```ts
type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

interface Message {
  role: MessageRole;
  content: string | null;      // null when assistant turn has only tool_calls
  tool_calls?: ToolCall[];     // set when role='assistant' and LLM called tools
  tool_results?: ToolResult[]; // set when role='tool'
}

interface SessionContext {
  session_id: string;
  history: Message[];          // full conversation excluding the new message
  constraints_remaining: ConstraintsRemaining;
}
```

### Tool Calling (adapter-agnostic)

Defined here so both OpenAI and Anthropic adapters share the same tool contract. Each adapter converts `ToolDefinition` to its native format (`function` schema for OpenAI, `input_schema` for Anthropic).

```ts
type ToolName =
  | 'read_file'
  | 'write_file'
  | 'run_command'
  | 'list_directory'
  | 'search_files';

interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: Record<string, ToolParameter>;
  required: string[];
}

interface ToolCall {
  id: string;                       // LLM-provided ID, used to match results
  name: ToolName;
  input: Record<string, unknown>;
}

interface ToolResult {
  tool_call_id: string;
  name: ToolName;
  output: string;
  is_error: boolean;
}
```

### Agent Response

```ts
type StopReason = 'end_turn' | 'tool_use' | 'max_tokens';

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface AgentResponse {
  content: string | null;     // null when stop_reason='tool_use'
  tool_calls?: ToolCall[];
  usage: TokenUsage;
  stop_reason: StopReason;
}

interface AgentCapabilities {
  supports_system_prompt: boolean;
  supports_tool_use: boolean;
  max_context_window: number;
}
```

### AgentAdapter Interface

```ts
interface AgentAdapter {
  init(config: AgentConfig): Promise<void>;
  sendMessage(msg: string, context: SessionContext): Promise<AgentResponse>;
  getTokenUsage(): TokenUsage;
  getCapabilities(): AgentCapabilities;
  getTools(): ToolDefinition[];
}
```

### Session

```ts
type SessionStatus = 'active' | 'completed' | 'expired';

interface Session {
  id: string;
  prompt_id: string;
  candidate_email: string;
  status: SessionStatus;
  created_at: number;         // Unix ms
  closed_at?: number;
  constraint: Constraint;
  tokens_used: number;
  interactions_used: number;
  score?: number;             // composite score, set after metrics computed
}
```

### Metrics

```ts
interface MetricResult {
  name: string;
  score: number;              // 0–1 normalized
  label: string;
  details?: string;
}
```

### Session Recording and Replay

```ts
type ReplayEventType =
  | 'message'
  | 'agent_response'
  | 'tool_call'
  | 'tool_result'
  | 'code_change'
  | 'terminal_output'
  | 'resource_usage';

interface ReplayEvent {
  type: ReplayEventType;
  timestamp: number;          // Unix ms
  payload: unknown;           // typed per consumer; loose here to avoid circular deps
}

interface SessionRecording {
  session_id: string;
  events: ReplayEvent[];
}
```

### Review Dashboard

```ts
interface ReviewData {
  session: Session;
  messages: Message[];
  metrics: MetricResult[];
  recording: SessionRecording;
}
```

## Exports

`packages/core/src/index.ts` re-exports everything from `types.ts` plus the existing `VERSION` constant.

## Verification

- `npm run typecheck` passes from root
- `npm run lint` passes from root
- `npm run test` passes (no runtime logic in this story — typecheck is the test)
