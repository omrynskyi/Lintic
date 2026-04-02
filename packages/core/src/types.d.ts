export interface Constraint {
    max_session_tokens: number;
    max_message_tokens: number;
    max_interactions: number;
    context_window: number;
    time_limit_minutes: number;
}
export interface ConstraintsRemaining {
    tokens_remaining: number;
    interactions_remaining: number;
    seconds_remaining: number;
}
export type AgentProvider = 'openai-compatible' | 'anthropic-native' | 'groq';
export interface AgentConfig {
    provider: AgentProvider;
    base_url?: string;
    api_key: string;
    model: string;
}
export type ToolName = 'read_file' | 'write_file' | 'run_command' | 'list_directory' | 'search_files';
export interface ToolParameter {
    type: string;
    description: string;
    enum?: string[];
}
export interface ToolDefinition {
    name: ToolName;
    description: string;
    parameters: Record<string, ToolParameter>;
    required: string[];
}
export interface ToolCall {
    id: string;
    name: ToolName;
    input: Record<string, unknown>;
}
export interface ToolResult {
    tool_call_id: string;
    name: ToolName;
    output: string;
    is_error: boolean;
}
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export interface Message {
    role: MessageRole;
    content: string | null;
    tool_calls?: ToolCall[];
    tool_results?: ToolResult[];
}
export interface SessionContext {
    session_id: string;
    history: Message[];
    constraints_remaining: ConstraintsRemaining;
}
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens';
export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}
export interface AgentResponse {
    content: string | null;
    tool_calls?: ToolCall[];
    usage: TokenUsage;
    stop_reason: StopReason;
}
export interface AgentCapabilities {
    supports_system_prompt: boolean;
    supports_tool_use: boolean;
    max_context_window: number;
}
export interface AgentAdapter {
    init(config: AgentConfig): Promise<void>;
    sendMessage(msg: string | null, context: SessionContext): Promise<AgentResponse>;
    getTokenUsage(): TokenUsage;
    getCapabilities(): AgentCapabilities;
    getTools(): ToolDefinition[];
}
export type SessionStatus = 'active' | 'completed' | 'expired';
export interface Session {
    id: string;
    prompt_id: string;
    candidate_email: string;
    status: SessionStatus;
    created_at: number;
    closed_at?: number;
    constraint: Constraint;
    tokens_used: number;
    interactions_used: number;
    score?: number;
}
export interface PromptSummary {
    id: string;
    title: string;
    description?: string;
    tags?: string[];
}
export interface MetricResult {
    name: string;
    score: number;
    label: string;
    details?: string;
}
export type ReplayEventType = 'message' | 'agent_response' | 'tool_call' | 'tool_result' | 'code_change' | 'terminal_output' | 'resource_usage';
export interface ReplayEvent {
    type: ReplayEventType;
    timestamp: number;
    payload: unknown;
}
export interface SessionRecording {
    session_id: string;
    events: ReplayEvent[];
}
export interface ReviewData {
    session: Session;
    messages: Message[];
    metrics: MetricResult[];
    recording: SessionRecording;
}
//# sourceMappingURL=types.d.ts.map