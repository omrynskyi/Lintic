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

// ─── Internal OpenAI wire types ───────────────────────────────────────────────

interface OpenAIToolCallFunction {
  name: string;
  arguments: string; // JSON-encoded
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: OpenAIToolCallFunction;
}

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIToolFunctionDef {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

interface OpenAITool {
  type: 'function';
  function: OpenAIToolFunctionDef;
}

interface OpenAIChoice {
  finish_reason: string;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorBody {
  error?: {
    message?: string;
    code?: string;
  };
}

// ─── Error type ───────────────────────────────────────────────────────────────

export class AdapterError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'AdapterError';
    this.status = status;
    this.code = code;
  }
}

// ─── Static tool definitions ──────────────────────────────────────────────────

const TOOLS: ToolDefinition[] = [
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

// ─── OpenAIAdapter ────────────────────────────────────────────────────────────

export class OpenAIAdapter implements AgentAdapter {
  private config: AgentConfig | null = null;
  private baseUrl: string = 'https://api.openai.com';
  private lastUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  async init(config: AgentConfig): Promise<void> {
    if (!config.api_key) {
      throw new AdapterError('OpenAIAdapter: api_key is required', 0, 'missing_api_key');
    }
    this.config = config;
    this.baseUrl = (config.base_url ?? 'https://api.openai.com').replace(/\/$/, '');
  }

  async sendMessage(msg: string, context: SessionContext): Promise<AgentResponse> {
    if (!this.config) {
      throw new AdapterError(
        'OpenAIAdapter: call init() before sendMessage()',
        0,
        'not_initialized',
      );
    }

    const messages: OpenAIChatMessage[] = [
      ...context.history.map(toOpenAIMessage),
      { role: 'user', content: msg },
    ];

    const requestBody = {
      model: this.config.model,
      messages,
      tools: toOpenAITools(TOOLS),
      max_tokens: context.constraints_remaining.tokens_remaining,
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.api_key}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      throw new AdapterError(
        `OpenAIAdapter: network error – ${err instanceof Error ? err.message : String(err)}`,
        0,
        'network_error',
      );
    }

    if (!response.ok) {
      let errMessage = `HTTP ${response.status}`;
      let errCode = String(response.status);
      try {
        const body = (await response.json()) as OpenAIErrorBody;
        if (body.error?.message) errMessage = body.error.message;
        if (body.error?.code) errCode = body.error.code;
      } catch {
        // ignore JSON parse failure – keep the HTTP status message
      }
      throw new AdapterError(errMessage, response.status, errCode);
    }

    const data = (await response.json()) as OpenAIResponse;
    const choice = data.choices[0];
    if (!choice) {
      throw new AdapterError('OpenAIAdapter: empty choices in response', 0, 'empty_response');
    }

    this.lastUsage = {
      prompt_tokens: data.usage.prompt_tokens,
      completion_tokens: data.usage.completion_tokens,
      total_tokens: data.usage.total_tokens,
    };

    const toolCalls = choice.message.tool_calls?.map(fromOpenAIToolCall) ?? [];
    const stopReason = mapFinishReason(choice.finish_reason);

    const agentResponse: AgentResponse = {
      content: choice.message.content,
      usage: this.lastUsage,
      stop_reason: stopReason,
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
      max_context_window: 128000,
    };
  }

  getTools(): ToolDefinition[] {
    return TOOLS;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toOpenAIMessage(msg: Message): OpenAIChatMessage {
  if (msg.role === 'tool') {
    const result = msg.tool_results?.[0];
    const out: OpenAIChatMessage = {
      role: 'tool',
      content: result?.output ?? '',
      tool_call_id: result?.tool_call_id ?? '',
    };
    if (result?.name !== undefined) {
      out.name = result.name;
    }
    return out;
  }

  if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
    return {
      role: 'assistant',
      content: msg.content,
      tool_calls: msg.tool_calls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.input) },
      })),
    };
  }

  return {
    role: msg.role as 'system' | 'user' | 'assistant',
    content: msg.content,
  };
}

function fromOpenAIToolCall(tc: OpenAIToolCall): ToolCall {
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
  } catch {
    input = {};
  }
  return { id: tc.id, name: tc.function.name as ToolName, input };
}

function toOpenAITools(tools: ToolDefinition[]): OpenAITool[] {
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

function mapFinishReason(reason: string): AgentResponse['stop_reason'] {
  if (reason === 'tool_calls') return 'tool_use';
  if (reason === 'length') return 'max_tokens';
  return 'end_turn';
}
