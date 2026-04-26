import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked, Renderer } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import {
  Send,
  CornerDownLeft,
  ChevronDown,
  Square,
  MessageSquare,
  AlertCircle,
  Bookmark,
  Check,
  X,
  Plus,
  RefreshCw,
  FileText,
  FolderTree,
  Layers3,
  RotateCcw,
} from 'lucide-react';
import { ToolActionCard } from './ToolActionCard.js';
import type { LocalToolAction, LocalToolCall, LocalToolResult } from './ToolActionCard.js';
import type { PersistedBranchSummary } from '../lib/session-persist.js';
import { DropdownMenu, DropdownTriggerLabel } from './DropdownMenu.js';

export type AgentMode = 'build' | 'plan';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Tool actions associated with this assistant turn. */
  tool_actions?: LocalToolAction[];
  thinking?: string | null;
  /** Unix timestamp in ms */
  timestamp: number;
  turnSequence?: number | null;
}

export interface ChatConstraints {
  tokensRemaining: number;
  maxTokens: number;
  contextWindow?: number;
  interactionsRemaining: number;
  maxInteractions: number;
}

interface ConversationSummary {
  id: string;
  branch_id: string;
  title: string;
  archived: boolean;
  created_at: number;
  updated_at: number;
}

interface ContextAttachment {
  id: string;
  conversation_id: string;
  kind: 'file' | 'repo_map' | 'summary' | 'prior_conversation';
  label: string;
  path?: string;
  resource_id?: string;
  source_conversation_id?: string;
  created_at: number;
}

interface ContextResource {
  id: string;
  kind: 'repo_map' | 'summary';
  title: string;
  content: string;
  source_conversation_id?: string;
  updated_at: number;
}

interface ContextCandidateFile {
  path: string;
  label: string;
  selected: boolean;
}

interface ContextCandidateResource {
  id: string;
  kind: 'repo_map' | 'summary';
  title: string;
  source_conversation_id: string | null;
  source_conversation_title?: string | null;
  updated_at?: number;
  selected: boolean;
  preview?: string;
  message_count?: number;
  empty?: boolean;
}

interface ContextCandidateConversation {
  id: string;
  title: string;
  updated_at: number;
  selected: boolean;
  active?: boolean;
  message_count?: number;
  empty?: boolean;
  has_summary?: boolean;
  summary_resource_id?: string | null;
  preview?: string;
  descriptor?: string;
}

interface ContextUsageBreakdown {
  context_usage_pct: number;
  context_tokens_estimate: number;
  context_window: number;
  conversation_messages: number;
  attached_summary: string;
  repo_map_attached: boolean;
  file_count: number;
  summary_count: number;
  prior_chat_count: number;
  warnings: string[];
}

/** Minimal agent config shape forwarded to the backend for per-request adapter creation. */
export interface AgentConfig {
  provider: string;
  api_key: string;
  model: string;
  base_url?: string;
}

interface SSEDonePayload {
  content: string | null;
  thinking?: string | null;
  stop_reason: string;
  tool_actions: Array<{ description?: string | null; tool_calls: LocalToolCall[]; tool_results: LocalToolResult[] }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  constraints_remaining: { tokens_remaining: number; interactions_remaining: number; seconds_remaining: number };
  turn_sequence?: number;
}

interface SSEToolCallsPayload {
  request_id: string;
  description?: string | null;
  thinking?: string | null;
  tool_calls: LocalToolCall[];
  turn_sequence?: number;
}

interface StoredAssistantPayload {
  __type?: 'tool_use' | 'assistant_response';
  content?: string | null;
  thinking?: string | null;
  tool_calls?: LocalToolCall[];
}

/** Parse SSE events from a fetch ReadableStream. Yields { event, data } for each complete event block. */
async function* readSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: unknown }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        if (!block.trim()) continue;
        let event = 'message';
        let dataStr = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) event = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataStr = line.slice(6);
        }
        if (dataStr) yield { event, data: JSON.parse(dataStr) as unknown };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

interface ChatPanelProps {
  /** Active session ID.  When null the panel shows a setup state. */
  sessionId: string | null;
  constraints: ChatConstraints;
  /** Bearer token for authenticating API requests. */
  sessionToken?: string;
  /** Backend base URL, e.g. "http://localhost:3300" */
  apiBase?: string;
  /** Called after the agent replies so the parent can update constraint state */
  onConstraintsUpdate?: (updated: Partial<ChatConstraints>) => void;
  /** When provided, used to execute tool calls locally (WebContainer). */
  onExecuteTools?: (calls: LocalToolCall[]) => Promise<LocalToolResult[]>;
  /** When provided, called when the user stops the current turn so in-flight tools can be terminated. */
  onStopTools?: () => void;
  /** When provided, forwarded to the backend as `agent_config` for per-request adapter creation. */
  agentConfig?: AgentConfig;
  /** Notifies the parent when a turn is actively running. */
  onLoadingChange?: (loading: boolean) => void;
  mode?: AgentMode;
  onModeChange?: (mode: AgentMode) => void;
  timeExpired?: boolean;
  latestPlanPath?: string | null;
  onPlanGenerated?: (path: string) => void;
  onApprovePlan?: (path: string) => Promise<string>;
  modelLabel?: string;
  branches?: PersistedBranchSummary[];
  activeBranchId?: string | null;
  onBranchChange?: (branchId: string) => void;
  onSaveCheckpoint?: (label: string) => Promise<void> | void;
  onCreateBranch?: (name: string, turnSequence: number, conversationId?: string) => Promise<void> | void;
  onTurnComplete?: (turnSequence: number) => void;
  activeFilePath?: string | null;
  onRewind?: (turnSequence: number, mode: 'code' | 'both') => Promise<void>;
  onPrune?: (turnSequence: number) => Promise<void>;
  onToast?: (message: string) => void;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const MESSAGE_DEDUPE_WINDOW_MS = 5_000;

function isSameMessage(a: ChatMessage, b: ChatMessage): boolean {
  if (a.id === b.id) {
    return true;
  }

  return (
    a.role === b.role &&
    a.content === b.content &&
    Math.abs(a.timestamp - b.timestamp) <= MESSAGE_DEDUPE_WINDOW_MS
  );
}

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const merged = [...existing];

  for (const message of incoming) {
    if (!merged.some((candidate) => isSameMessage(candidate, message))) {
      merged.push(message);
    }
  }

  merged.sort((a, b) => a.timestamp - b.timestamp);
  return merged;
}

function assignTurnSequenceToLatestUserMessage(
  messages: ChatMessage[],
  turnSequence: number,
): ChatMessage[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== 'user' || typeof message.turnSequence === 'number') {
      continue;
    }

    const next = [...messages];
    next[i] = { ...message, turnSequence };
    return next;
  }

  return messages;
}

/** Helper to parse JSON tool use from assistant content */
function parseToolUse(content: string): { content: string | null; tool_actions: LocalToolAction[] } {
  const tool_actions: LocalToolAction[] = [];
  let remainingText = content;

  // 1. Try parsing the whole thing if it looks like a tool_use JSON block
  if (content.trim().startsWith('{') && content.includes('"__type"') && content.includes('"tool_use"')) {
    try {
      const parsed = JSON.parse(content.trim());
      if (parsed.__type === 'tool_use' && parsed.tool_calls) {
        return {
          content: null,
          tool_actions: [{ description: parsed.content || null, tool_calls: parsed.tool_calls, tool_results: [] }]
        };
      }
    } catch {
      // Fall back to regex/extraction if direct parse fails
    }
  }

  // 2. Look for ANY JSON block that looks like tool_use using a more robust approach
  // We look for the start sequence and then try to find the matching closing brace
  const marker = '"__type"';
  let startIndex = remainingText.indexOf(marker);
  
  while (startIndex !== -1) {
    // Find the start of the object containing this marker
    let objStart = remainingText.lastIndexOf('{', startIndex);
    if (objStart !== -1) {
      // Basic brace counting to find the matching end brace
      let depth = 0;
      let objEnd = -1;
      for (let i = objStart; i < remainingText.length; i++) {
        if (remainingText[i] === '{') depth++;
        else if (remainingText[i] === '}') {
          depth--;
          if (depth === 0) {
            objEnd = i;
            break;
          }
        }
      }

      if (objEnd !== -1) {
        const potentialJson = remainingText.slice(objStart, objEnd + 1);
        try {
          const parsed = JSON.parse(potentialJson);
          if (parsed.__type === 'tool_use' && parsed.tool_calls) {
            tool_actions.push({ description: parsed.content || null, tool_calls: parsed.tool_calls, tool_results: [] });
            remainingText = remainingText.slice(0, objStart) + remainingText.slice(objEnd + 1);
            // Restart search from current position as remainingText has changed
            startIndex = remainingText.indexOf(marker);
            continue;
          }
        } catch {
          // Not valid JSON
        }
      }
    }
    startIndex = remainingText.indexOf(marker, startIndex + 1);
  }

  // 3. Look for <function/NAME{...} patterns (fallback for some models)
  const functionRegex = /<function\/(\w+)(\{[\s\S]*?\})/g;
  let funcMatch;
  while ((funcMatch = functionRegex.exec(remainingText)) !== null) {
    try {
      const name = funcMatch[1];
      const input = JSON.parse(funcMatch[2]!);
      tool_actions.push({
        tool_calls: [{ id: generateId(), name: name!, input }],
        tool_results: []
      });
      remainingText = remainingText.replace(funcMatch[0], '');
    } catch {
      // Invalid JSON in function call
    }
  }

  return {
    content: remainingText.trim() || null,
    tool_actions
  };
}

// Configure a custom renderer with highlight.js code highlighting.
const renderer = new Renderer();
renderer.code = ({ text, lang }: { text: string; lang?: string | null }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(text, { language }).value;
  return `<pre class="hljs-pre"><code class="hljs language-${language}">${highlighted}</code></pre>`;
};

function renderMarkdown(content: string): string {
  return marked(content, { renderer }) as string;
}

function formatConversationTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();
  return isSameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const THINKING_WORDS = [
  'Pondering',
  'Contemplating',
  'Ruminating',
  'Musing',
  'Reflecting',
  'Deliberating',
  'Meditating',
  'Analyzing',
  'Synthesizing',
  'Speculating',
  'Evaluating',
  'Parsing',
  'Scrutinizing',
  'Probing',
  'Dissecting',
  'Extrapolating',
  'Ideating',
  'Sifting',
  'Interrogating',
  'Envisioning',
] as const;

function supportsThinkingDisplay(agentConfig?: AgentConfig, modelLabel?: string): boolean {
  const provider = agentConfig?.provider;
  const model = agentConfig?.model ?? modelLabel ?? '';
  return provider === 'anthropic-native' && /mythos|claude-.*(?:3-7|4)/i.test(model);
}

function parseStoredAssistantPayload(rawContent: string): StoredAssistantPayload | null {
  if (!rawContent.trim().startsWith('{') || !rawContent.includes('"__type"')) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawContent) as StoredAssistantPayload;
    if (parsed.__type === 'tool_use' || parsed.__type === 'assistant_response') {
      return parsed;
    }
  } catch {
    // Ignore invalid payloads and fall back to plain-text rendering.
  }

  return null;
}

function ThinkingWord({ active }: { active: boolean }) {
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setInterval(() => {
      setWordIndex((current) => (current + 1) % THINKING_WORDS.length);
    }, 1400);

    return () => window.clearInterval(timer);
  }, [active]);

  return (
    <span data-testid="thinking-status-word" className="text-[13px] font-medium tracking-tight">
      {THINKING_WORDS[wordIndex]}
    </span>
  );
}

function AssistantGroup({
  messages,
  activeConversationId,
  onCreateBranch,
}: {
  messages: ChatMessage[];
  activeConversationId: string | null;
  onCreateBranch?: (name: string, turnSequence: number, conversationId?: string) => Promise<void> | void;
}) {
  const [activeTab, setActiveTab] = useState<'response' | 'thinking'>('response');
  const allToolActions: LocalToolAction[] = [];
  const contentBlocks: string[] = [];
  const thinkingBlocks: string[] = [];

  for (const msg of messages) {
    if (msg.tool_actions) {
      allToolActions.push(...msg.tool_actions);
    }

    if (msg.thinking) {
      thinkingBlocks.push(msg.thinking);
    }

    if (msg.content) {
      const parsed = parseToolUse(msg.content);
      if (parsed.content) {
        contentBlocks.push(parsed.content);
      }
      if (parsed.tool_actions.length > 0) {
        allToolActions.push(...parsed.tool_actions);
      }
    }
  }

  const hasThinking = thinkingBlocks.length > 0;
  const latestTurnSequence = messages.at(-1)?.turnSequence;

  useEffect(() => {
    if (!hasThinking && activeTab === 'thinking') {
      setActiveTab('response');
    }
  }, [activeTab, hasThinking]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5 py-1">
      {hasThinking ? (
        <div className="px-1">
          <div className="inline-flex rounded-full p-1" style={{ background: 'var(--color-surface-subtle)' }}>
            {([
              ['response', 'Response'],
              ['thinking', 'Thinking'],
            ] as const).map(([tabId, label]) => {
              const isActive = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  data-testid={`assistant-tab-${tabId}`}
                  onClick={() => setActiveTab(tabId)}
                  className="rounded-[var(--assessment-radius-pill)] px-3 py-1.5 text-[12px] font-semibold transition-colors"
                  style={{
                    background: isActive ? 'var(--color-bg-send-btn)' : 'transparent',
                    color: isActive ? 'var(--color-text-on-send-btn)' : 'var(--color-text-dim)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === 'response' ? (
        <>
          {allToolActions.length > 0 && (
            <div className="w-full px-1" data-testid="tool-actions-container">
              <ToolActionCard action={allToolActions} />
            </div>
          )}
          {contentBlocks.map((content, index) => (
            <div
              key={index}
              className="chat-markdown w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden break-words px-2 text-[14px]"
              style={{ color: 'var(--color-text-agent-msg)' }}
              data-testid="agent-message"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          ))}
        </>
      ) : (
        <div
          className="chat-markdown w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden break-words px-2 text-[14px]"
          style={{ color: 'var(--color-text-agent-msg)', opacity: 0.86 }}
          data-testid="thinking-message"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(thinkingBlocks.join('\n\n')) }}
        />
      )}

      {latestTurnSequence && onCreateBranch ? (
        <div className="px-2 pt-1">
          <button
            type="button"
            onClick={() => {
              const name = window.prompt('New branch name');
              if (name?.trim() && typeof latestTurnSequence === 'number') {
                void onCreateBranch(name.trim(), latestTurnSequence, activeConversationId ?? undefined);
              }
            }}
            className="text-[11px] opacity-60 transition-opacity hover:opacity-100"
            style={{ color: 'var(--color-text-main)' }}
          >
            Branch from here
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ChatPanel({
  sessionId,
  constraints,
  sessionToken,
  apiBase = '',
  onConstraintsUpdate,
  onExecuteTools,
  onStopTools,
  agentConfig,
  onLoadingChange,
  mode = 'build',
  onModeChange,
  timeExpired = false,
  latestPlanPath,
  onPlanGenerated,
  onApprovePlan,
  modelLabel,
  branches = [],
  activeBranchId,
  onBranchChange,
  onSaveCheckpoint,
  onCreateBranch,
  onTurnComplete,
  activeFilePath,
  onRewind,
  onPrune,
  onToast,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const checkpointInputRef = useRef<HTMLInputElement>(null);
  const contextPanelRef = useRef<HTMLDivElement>(null);
  const historyKeyRef = useRef<string | null>(null);
  const [checkpointEditing, setCheckpointEditing] = useState(false);
  const [checkpointName, setCheckpointName] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [rewindPopoverFor, setRewindPopoverFor] = useState<string | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextAttachments, setContextAttachments] = useState<ContextAttachment[]>([]);
  const [contextFiles, setContextFiles] = useState<ContextCandidateFile[]>([]);
  const [contextResourceCandidates, setContextResourceCandidates] = useState<ContextCandidateResource[]>([]);
  const [priorConversationCandidates, setPriorConversationCandidates] = useState<ContextCandidateConversation[]>([]);
  const [contextUsageBreakdown, setContextUsageBreakdown] = useState<ContextUsageBreakdown | null>(null);
  const [contextDetailsOpen, setContextDetailsOpen] = useState(false);
  const [expandedResourceIds, setExpandedResourceIds] = useState<string[]>([]);

  const exhausted =
    timeExpired
    || constraints.interactionsRemaining <= 0
    || constraints.tokensRemaining <= 0;

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Load history when the active conversation changes.
  useEffect(() => {
    if (!sessionId) return;
    const historyKey = `${sessionId}:${activeBranchId ?? 'main'}:${activeConversationId ?? 'main'}`;
    if (historyKeyRef.current !== null && historyKeyRef.current !== historyKey) {
      setMessages([]);
    }
    historyKeyRef.current = historyKey;
    const headers: HeadersInit = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
    void (async () => {
      try {
        const params = new URLSearchParams();
        if (activeBranchId) {
          params.set('branch_id', activeBranchId);
        }
        if (activeConversationId) {
          params.set('conversation_id', activeConversationId);
        }
        const query = params.toString();
        const res = await fetch(
          `${apiBase}/api/sessions/${sessionId}/messages${query ? `?${query}` : ''}`,
          { headers },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: Array<{
            id: string;
            role: 'user' | 'assistant';
            content: string;
            created_at: string;
            turn_sequence?: number | null;
          }>;
          conversations?: ConversationSummary[];
          active_conversation_id?: string | null;
        };
        const loadedMessages = data.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => {
            const parsed = m.role === 'assistant' ? parseStoredAssistantPayload(m.content) : null;
            return {
              id: m.id,
              role: m.role,
              content: parsed ? (parsed.content ?? '') : m.content,
              ...(parsed?.thinking !== undefined ? { thinking: parsed.thinking } : {}),
              ...(parsed?.__type === 'tool_use' && parsed.tool_calls
                ? { tool_actions: [{ description: parsed.content ?? null, tool_calls: parsed.tool_calls, tool_results: [] }] }
                : {}),
              timestamp: new Date(m.created_at).getTime(),
              turnSequence: m.turn_sequence ?? null,
            };
          });

        setMessages((prev) => mergeMessages(prev, loadedMessages));
        setConversations(data.conversations ?? []);
        if (data.active_conversation_id) {
          setActiveConversationId(data.active_conversation_id);
        }
      } catch {
        // Ignore load errors.
      }
    })();
  }, [activeBranchId, activeConversationId, sessionId, apiBase, sessionToken]);

  useEffect(() => {
    if (!sessionId) {
      onLoadingChange?.(false);
    }
  }, [sessionId, onLoadingChange]);

  useEffect(() => {
    if (!checkpointEditing) {
      return;
    }

    const timer = window.setTimeout(() => {
      checkpointInputRef.current?.focus();
      checkpointInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [checkpointEditing]);

  useEffect(() => {
    if (!contextPanelOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!contextPanelRef.current?.contains(event.target as Node)) {
        setContextPanelOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextPanelOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextPanelOpen]);

  useEffect(() => {
    if (!rewindPopoverFor) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('[data-rewind-popover]')) {
        setRewindPopoverFor(null);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [rewindPopoverFor]);

  useEffect(() => {
    setMessages([]);
    setConversations([]);
    setActiveConversationId(null);
    setContextAttachments([]);
    setContextFiles([]);
    setContextResourceCandidates([]);
    setPriorConversationCandidates([]);
    setContextUsageBreakdown(null);
    setContextDetailsOpen(false);
    setExpandedResourceIds([]);

    if (!sessionId || !activeBranchId) {
      return;
    }

    const headers: HeadersInit = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
    void (async () => {
      try {
        const res = await fetch(
          `${apiBase}/api/sessions/${sessionId}/conversations?branch_id=${encodeURIComponent(activeBranchId)}`,
          { headers },
        );
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as {
          conversations: ConversationSummary[];
          active_conversation_id: string | null;
        };
        setConversations(data.conversations ?? []);
        setActiveConversationId(data.active_conversation_id);
      } catch {
        // Ignore load errors.
      }
    })();
  }, [activeBranchId, apiBase, sessionId, sessionToken]);

  const stopAgent = useCallback(() => {
    onStopTools?.();
    abortRef.current?.abort();
  }, [onStopTools]);

  const loadContextState = useCallback(async (conversationId: string) => {
    if (!sessionId || !activeBranchId) {
      return;
    }
    const headers: HeadersInit = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
    const params = new URLSearchParams({
      branch_id: activeBranchId,
      conversation_id: conversationId,
    });
    const res = await fetch(`${apiBase}/api/sessions/${sessionId}/context?${params.toString()}`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to load context (${res.status})`);
    }
    const data = (await res.json()) as {
      conversations: ConversationSummary[];
      attachments: ContextAttachment[];
      resources: ContextResource[];
      usage_breakdown: ContextUsageBreakdown;
      available: {
        files: ContextCandidateFile[];
        resources: ContextCandidateResource[];
        prior_conversations: ContextCandidateConversation[];
      };
    };
    setConversations(data.conversations ?? []);
    setContextAttachments(data.attachments ?? []);
    setContextFiles(data.available?.files ?? []);
    setContextResourceCandidates(data.available?.resources ?? []);
    setPriorConversationCandidates(data.available?.prior_conversations ?? []);
    setContextUsageBreakdown(data.usage_breakdown ?? null);
  }, [activeBranchId, apiBase, sessionId, sessionToken]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }
    void loadContextState(activeConversationId).catch(() => {
      // Ignore sidebar context load errors.
    });
  }, [activeConversationId, loadContextState]);

  const persistAttachments = useCallback(async (
    nextAttachments: Array<{
      kind: ContextAttachment['kind'];
      label: string;
      path?: string;
      resource_id?: string;
      source_conversation_id?: string;
    }>,
  ) => {
    if (!sessionId || !activeConversationId) {
      return;
    }
    setContextBusy(true);
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      };
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}/conversations/${activeConversationId}/context`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ attachments: nextAttachments }),
      });
      if (!res.ok) {
        throw new Error(`Failed to save context (${res.status})`);
      }
      await loadContextState(activeConversationId);
    } finally {
      setContextBusy(false);
    }
  }, [activeConversationId, apiBase, loadContextState, sessionId, sessionToken]);

  const handleStartCheckpointEdit = useCallback(() => {
    setCheckpointName('');
    setCheckpointEditing(true);
  }, []);

  const handleCancelCheckpointEdit = useCallback(() => {
    setCheckpointEditing(false);
    setCheckpointName('');
  }, []);

  const handleSubmitCheckpoint = useCallback(() => {
    const label = checkpointName.trim();
    if (!label) {
      return;
    }
    void onSaveCheckpoint?.(label);
    setCheckpointEditing(false);
    setCheckpointName('');
  }, [checkpointName, onSaveCheckpoint]);

  const handleCreateConversation = useCallback(async () => {
    if (!sessionId || !activeBranchId) {
      return;
    }
    setContextBusy(true);
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      };
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}/conversations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          branch_id: activeBranchId,
          ...(activeConversationId ? { source_conversation_id: activeConversationId } : {}),
          ...(activeFilePath ? { active_path: activeFilePath } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to create conversation (${res.status})`);
      }
      const data = (await res.json()) as {
        conversations: ConversationSummary[];
        active_conversation_id: string;
      };
      setConversations(data.conversations ?? []);
      setActiveConversationId(data.active_conversation_id);
      setMessages([]);
      setInput('');
      setContextPanelOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
    } finally {
      setContextBusy(false);
    }
  }, [activeBranchId, activeConversationId, activeFilePath, apiBase, sessionId, sessionToken]);

  const handleToggleFileContext = useCallback(async (candidate: ContextCandidateFile) => {
    const exists = contextAttachments.some((attachment) => attachment.kind === 'file' && attachment.path === candidate.path);
    const nextAttachments = exists
      ? contextAttachments.filter((attachment) => !(attachment.kind === 'file' && attachment.path === candidate.path))
      : [...contextAttachments, {
          id: generateId(),
          conversation_id: activeConversationId ?? '',
          kind: 'file' as const,
          label: candidate.label,
          path: candidate.path,
          created_at: Date.now(),
        }];
    await persistAttachments(nextAttachments.map((attachment) => ({
      kind: attachment.kind,
      label: attachment.label,
      ...(attachment.path ? { path: attachment.path } : {}),
      ...(attachment.resource_id ? { resource_id: attachment.resource_id } : {}),
      ...(attachment.source_conversation_id ? { source_conversation_id: attachment.source_conversation_id } : {}),
    })));
  }, [activeConversationId, contextAttachments, persistAttachments]);

  const handleDetachContext = useCallback(async () => {
    await persistAttachments([]);
  }, [persistAttachments]);

  const handleToggleResourceContext = useCallback(async (candidate: ContextCandidateResource) => {
    const exists = contextAttachments.some((attachment) => attachment.resource_id === candidate.id);
    const nextAttachments = exists
      ? contextAttachments.filter((attachment) => attachment.resource_id !== candidate.id)
      : [...contextAttachments, {
          id: generateId(),
          conversation_id: activeConversationId ?? '',
          kind: candidate.kind,
          label: candidate.title,
          resource_id: candidate.id,
          created_at: Date.now(),
        }];
    await persistAttachments(nextAttachments.map((attachment) => ({
      kind: attachment.kind,
      label: attachment.label,
      ...(attachment.path ? { path: attachment.path } : {}),
      ...(attachment.resource_id ? { resource_id: attachment.resource_id } : {}),
      ...(attachment.source_conversation_id ? { source_conversation_id: attachment.source_conversation_id } : {}),
    })));
  }, [activeConversationId, contextAttachments, persistAttachments]);

  const handleOpenConversation = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
    setMessages([]);
  }, []);

  const handleGenerateRepoMap = useCallback(async () => {
    if (!sessionId || !activeBranchId) {
      return;
    }
    setContextBusy(true);
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      };
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}/context/repo-map`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ branch_id: activeBranchId }),
      });
      if (!res.ok) {
        throw new Error(`Failed to generate repo map (${res.status})`);
      }
      if (activeConversationId) {
        await loadContextState(activeConversationId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate repo map');
    } finally {
      setContextBusy(false);
    }
  }, [activeBranchId, activeConversationId, apiBase, loadContextState, sessionId, sessionToken]);

  const handleGenerateSummary = useCallback(async () => {
    if (!sessionId || !activeBranchId || !activeConversationId) {
      return;
    }
    setContextBusy(true);
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      };
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}/context/summary`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          branch_id: activeBranchId,
          conversation_id: activeConversationId,
          ...(agentConfig ? { agent_config: agentConfig } : {}),
        }),
      });
      const data = await res.json() as {
        error?: string;
        code?: string;
        source_conversation_title?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Failed to summarize chat (${res.status})`);
      }
      await loadContextState(activeConversationId);
      onToast?.(`Saved summary for "${data.source_conversation_title ?? 'current chat'}"`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to summarize chat');
    } finally {
      setContextBusy(false);
    }
  }, [activeBranchId, activeConversationId, apiBase, loadContextState, onToast, sessionId, sessionToken]);

  const sendMessage = useCallback(async (overrideText?: string, overrideMode?: AgentMode) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading || exhausted || !sessionId) return;
    const selectedMode = overrideMode ?? mode;

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const authHeaders: HeadersInit = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
    const jsonHeaders: HeadersInit = { 'Content-Type': 'application/json', ...authHeaders };
    const agentConfigBody = agentConfig ? { agent_config: agentConfig } : {};

    try {
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}/messages/stream`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          message: text,
          mode: selectedMode,
          ...(activeBranchId ? { branch_id: activeBranchId } : {}),
          ...(activeConversationId ? { conversation_id: activeConversationId } : {}),
          ...agentConfigBody,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const errBody = (await res.json()) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }

      for await (const { event, data } of readSSEStream(res.body)) {
        if (event === 'tool_calls') {
          const { request_id, description, thinking, tool_calls, turn_sequence } = data as SSEToolCallsPayload;
          if (typeof turn_sequence === 'number') {
            setMessages((prev) => assignTurnSequenceToLatestUserMessage(prev, turn_sequence));
          }
          const msgId = generateId();
          setMessages((prev) => [
            ...prev,
            {
              id: msgId,
              role: 'assistant',
              content: '',
              ...(thinking !== undefined ? { thinking } : {}),
              tool_actions: [{ description: description ?? null, tool_calls, tool_results: [] }],
              timestamp: Date.now(),
              turnSequence: turn_sequence ?? null,
            },
          ]);

          const toolResults: LocalToolResult[] = onExecuteTools
            ? await onExecuteTools(tool_calls)
            : tool_calls.map((c: LocalToolCall) => ({
                tool_call_id: c.id,
                name: c.name,
                output: 'Tool execution not available',
                is_error: true,
              }));

          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, tool_actions: [{ description: description ?? null, tool_calls, tool_results: toolResults }] }
                : m,
            ),
          );

          const generatedPlanPath = tool_calls
            .map((call) => ({
              path: typeof call.input['path'] === 'string' ? String(call.input['path']) : null,
              result: toolResults.find((result) => result.tool_call_id === call.id),
              name: call.name,
            }))
            .filter(({ path, result, name }) => name === 'write_file' && path?.startsWith('plans/') && !result?.is_error)
            .at(-1)?.path;

          if (generatedPlanPath) {
            onPlanGenerated?.(generatedPlanPath);
          }

          void fetch(`${apiBase}/api/sessions/${sessionId}/tool-results/${request_id}`, {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({
              tool_results: toolResults,
              ...(activeBranchId ? { branch_id: activeBranchId } : {}),
              ...(turn_sequence !== undefined ? { turn_sequence } : {}),
            }),
            signal: ctrl.signal,
          });

        } else if (event === 'done') {
          const result = data as SSEDonePayload;
          if (typeof result.turn_sequence === 'number') {
            setMessages((prev) => assignTurnSequenceToLatestUserMessage(prev, result.turn_sequence!));
          }
          onConstraintsUpdate?.({
            tokensRemaining: result.constraints_remaining.tokens_remaining,
            interactionsRemaining: result.constraints_remaining.interactions_remaining,
          });
          if (result.turn_sequence !== undefined) {
            onTurnComplete?.(result.turn_sequence);
          }
          if (result.content || result.thinking) {
            setMessages((prev) => [
              ...prev,
              {
                id: generateId(),
                role: 'assistant',
                content: result.content ?? '',
                ...(result.thinking !== undefined ? { thinking: result.thinking } : {}),
                timestamp: Date.now(),
                turnSequence: result.turn_sequence ?? null,
              },
            ]);
          }

        } else if (event === 'error') {
          const { error } = data as { error: string };
          throw new Error(error);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [
    activeConversationId,
    agentConfig,
    activeBranchId,
    apiBase,
    exhausted,
    input,
    loading,
    mode,
    onConstraintsUpdate,
    onExecuteTools,
    onPlanGenerated,
    onTurnComplete,
    sessionId,
    sessionToken,
  ]);

  const approvePlan = useCallback(async () => {
    if (!latestPlanPath || !onApprovePlan || loading) return;

    try {
      const approvedMessage = await onApprovePlan(latestPlanPath);
      onModeChange?.('build');
      await sendMessage(approvedMessage, 'build');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve plan');
    }
  }, [latestPlanPath, loading, onApprovePlan, onModeChange, sendMessage]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const totalTokenPct =
    constraints.maxTokens > 0
      ? (constraints.tokensRemaining / constraints.maxTokens) * 100
      : 0;
  const contextUsagePct = Math.max(
    0,
    Math.min(100, contextUsageBreakdown?.context_usage_pct ?? 0),
  );
  const isLowTokens = totalTokenPct < 20;
  const tokenRingRadius = 8;
  const tokenRingCircumference = 2 * Math.PI * tokenRingRadius;
  const tokenRingOffset = tokenRingCircumference - (contextUsagePct / 100) * tokenRingCircumference;
  const selectedBranch = branches.find((branch) => branch.id === activeBranchId) ?? branches[0] ?? null;
  const branchItems = branches.map((branch) => ({
    value: branch.id,
    label: branch.name,
    selected: branch.id === selectedBranch?.id,
    onSelect: () => onBranchChange?.(branch.id),
  }));
  const thinkingSupported = supportsThinkingDisplay(agentConfig, modelLabel);
  const currentChatMessageCount = useMemo(
    () => messages.filter((message) => message.role === 'user' || message.role === 'assistant').length,
    [messages],
  );
  const canSaveSummary = !!activeConversationId && currentChatMessageCount > 0 && !contextBusy;
  const selectedFileCount = contextFiles.filter((candidate) => candidate.selected).length;
  const selectedSummaryCount = contextResourceCandidates.filter((candidate) => candidate.selected && candidate.kind === 'summary').length;
  const repoMapSelected = contextResourceCandidates.some((candidate) => candidate.selected && candidate.kind === 'repo_map');
  const selectedParts = [
    repoMapSelected ? 'repo map' : null,
    selectedFileCount > 0 ? `${selectedFileCount} file${selectedFileCount === 1 ? '' : 's'}` : null,
    selectedSummaryCount > 0 ? `${selectedSummaryCount} saved summar${selectedSummaryCount === 1 ? 'y' : 'ies'}` : null,
  ].filter(Boolean);
  const attachedSummaryLine = selectedParts.length > 0 ? selectedParts.join(', ') : 'current chat only';
  const highUsageReason = selectedSummaryCount > 1
    ? `${selectedSummaryCount} summaries attached`
    : selectedFileCount > 0
      ? `Attached file${selectedFileCount > 1 ? 's' : ''}: ${selectedFileCount}`
      : 'Mostly from current chat history';
  const activeConversationTitle = (conversations ?? []).find((conversation) => conversation.id === activeConversationId)?.title ?? 'Current chat';
  const toggleExpandedResource = useCallback((id: string) => {
    setExpandedResourceIds((current) => current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : [...current, id]);
  }, []);

  return (
    <div className="flex min-w-0 flex-col h-full overflow-hidden" style={{ background: 'var(--color-bg-chat)' }}>
      {/* Messages */}
      <div className="relative flex min-w-0 min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-4 pb-4">
        {messages.length === 0 && !loading && (
          <div
            className="flex-1 flex items-center justify-center text-xs opacity-40 pt-12"
            style={{ color: 'var(--color-text-dim)' }}
          >
            Ask the agent to help with your solution.
          </div>
        )}

        {(() => {
          const rendered: React.ReactNode[] = [];
          let currentGroup: { role: 'user' | 'assistant'; messages: ChatMessage[] } | null = null;

          // Helper to group messages
          for (const msg of messages) {
            if (!currentGroup || currentGroup.role !== msg.role || msg.role === 'user') {
              currentGroup = { role: msg.role, messages: [msg] };
              rendered.push(currentGroup as any); // We'll map this below
            } else {
              currentGroup.messages.push(msg);
            }
          }

          return (rendered as unknown as Array<{ role: 'user' | 'assistant'; messages: ChatMessage[] }>).map((group, groupIdx) => {
            const isUser = group.role === 'user';
            
            if (isUser) {
              const msg = group.messages[0]!;
              const canRewind = (!!onRewind || !!onPrune) && typeof msg.turnSequence === 'number';
              const isRewindOpen = rewindPopoverFor === msg.id;

              return (
                <div key={msg.id} className="group/msg relative flex flex-col py-1">
                  <div
                    className="w-full rounded-[var(--assessment-radius-shell)] px-6 py-4 text-[14px] whitespace-pre-wrap break-words border-none shadow-none"
                    style={{ background: 'var(--color-bg-user-msg)', color: 'var(--color-text-user-msg)' }}
                    data-testid="user-message"
                  >
                    {msg.content}
                  </div>
                  {canRewind && (
                    <div className="absolute top-3 right-3" data-rewind-popover>
                      <button
                        type="button"
                        onClick={() => setRewindPopoverFor(isRewindOpen ? null : msg.id)}
                        className="flex items-center justify-center rounded-full w-7 h-7 opacity-0 group-hover/msg:opacity-100 transition-opacity hover:bg-[var(--color-surface-muted)]"
                        style={{ color: 'var(--color-text-dim)' }}
                        title="Rewind to here"
                        data-testid="rewind-button"
                      >
                        <RotateCcw size={13} />
                      </button>
                      {isRewindOpen && (
                        <div
                          className="absolute right-0 top-full mt-1 z-50 flex flex-col overflow-hidden rounded-[var(--assessment-radius-control)] shadow-2xl"
                          style={{
                            background: 'var(--color-bg-panel)',
                            border: '1px solid var(--color-border-main)',
                            backdropFilter: 'blur(10px)',
                            minWidth: '180px',
                            boxShadow: 'var(--assessment-shadow-soft)',
                          }}
                        >
                          {onRewind ? (
                            <>
                              <button
                                type="button"
                                onClick={() => { void (async () => {
                                  setRewindPopoverFor(null);
                                  const ts = msg.turnSequence as number;
                                  await onRewind(ts, 'both');
                                  setMessages((prev) => prev.filter((m) => {
                                    if (m.turnSequence === null || m.turnSequence === undefined) return false;
                                    return (m.turnSequence as number) <= ts;
                                  }));
                                  setInput(msg.content);
                                })(); }}
                                className="px-4 py-2.5 text-left text-[12px] transition hover:bg-[var(--color-surface-subtle)]"
                                style={{ color: 'var(--color-text-main)' }}
                              >
                                Rewind code + conversation
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRewindPopoverFor(null);
                                  void onRewind(msg.turnSequence as number, 'code');
                                }}
                                className="px-4 py-2.5 text-left text-[12px] transition hover:bg-[var(--color-surface-subtle)]"
                                style={{ color: 'var(--color-text-dim)', borderTop: '1px solid var(--color-border-main)' }}
                              >
                                Rewind code only
                              </button>
                            </>
                          ) : null}
                          {onPrune ? (
                            <button
                              type="button"
                              onClick={() => { void (async () => {
                                setRewindPopoverFor(null);
                                const ts = msg.turnSequence as number;
                                await onPrune(ts);
                                setMessages((prev) => prev.filter((m) => {
                                  if (m.turnSequence === null || m.turnSequence === undefined) return true;
                                  return (m.turnSequence as number) >= ts;
                                }));
                              })(); }}
                              className="px-4 py-2.5 text-left text-[12px] transition hover:bg-[var(--color-surface-subtle)]"
                              style={{
                                color: 'var(--color-text-dim)',
                                ...(onRewind ? { borderTop: '1px solid var(--color-border-main)' } : {}),
                              }}
                            >
                              Prune earlier messages
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <AssistantGroup
                key={`group-${groupIdx}`}
                messages={group.messages}
                activeConversationId={activeConversationId}
                onCreateBranch={onCreateBranch}
              />
            );
          });
        })()}

        {loading && (
          <div className="flex items-start gap-2 py-3">
            {thinkingSupported ? (
              <div
                data-testid="loading-spinner"
                className="flex max-w-[320px] flex-col gap-3 rounded-[var(--assessment-radius-shell)] px-4 py-4"
                style={{ background: 'var(--color-bg-agent-msg)', opacity: 0.72 }}
              >
                <div className="inline-flex w-fit rounded-full p-1" style={{ background: 'var(--color-surface-subtle)' }}>
                  <button
                    type="button"
                    className="rounded-[var(--assessment-radius-pill)] px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: 'transparent', color: 'var(--color-text-dim)' }}
                    disabled
                  >
                    Response
                  </button>
                  <button
                    type="button"
                    className="rounded-[var(--assessment-radius-pill)] px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: 'var(--color-bg-send-btn)', color: 'var(--color-text-on-send-btn)' }}
                    disabled
                  >
                    Thinking
                  </button>
                </div>
                <div style={{ color: 'var(--color-text-agent-msg)' }}>
                  <ThinkingWord active />
                </div>
              </div>
            ) : (
              <div
                data-testid="loading-spinner"
                className="flex items-center rounded-full px-5 py-3"
                style={{ background: 'var(--color-bg-agent-msg)', opacity: 0.72, color: 'var(--color-text-agent-msg)' }}
              >
                <ThinkingWord active />
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            className="flex items-center gap-3 rounded-[var(--assessment-radius-shell)] px-6 py-4 text-xs"
            style={{ background: 'var(--color-bg-error)', color: 'var(--color-status-error)' }}
          >
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Section */}
      <div className="shrink-0 px-5 pt-4">
        <div
          className="flex flex-col gap-5 rounded-[var(--assessment-radius-shell)] border-none px-5 pt-5 pb-3"
          style={{
            background: 'var(--color-bg-input)',
            boxShadow: 'var(--assessment-shadow-panel)',
          }}
        >
          <textarea
            ref={textareaRef}
            className="w-full text-[15px] resize-none outline-none border-none bg-transparent"
            style={{
              color: 'var(--color-text-main)',
              minHeight: '44px',
              maxHeight: '140px',
              fontFamily: 'inherit',
            }}
            placeholder={
              timeExpired
                ? 'Time is up — your assessment is being submitted.'
                : exhausted
                  ? 'Constraints exhausted'
                : mode === 'plan'
                  ? 'Ask the agent to inspect the repo and write a plan...'
                  : 'Tell the agent what to build...'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={exhausted || loading}
            rows={1}
            data-testid="chat-input"
          />

          <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-3 min-[900px]:gap-6">
              {/* Model Dropdown Mock */}
              <div
                className="flex min-w-0 items-center gap-2 text-[13px] font-medium opacity-60 cursor-pointer transition-opacity hover:opacity-100"
                style={{ color: 'var(--color-text-main)' }}
              >
                <span className="truncate">{agentConfig?.model || modelLabel || 'Configured model'}</span>
                <ChevronDown size={14} />
              </div>
              <div className="flex items-center rounded-full p-1" style={{ background: 'var(--color-surface-subtle)' }}>
                {(['build', 'plan'] as const).map((option) => {
                  const active = mode === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      data-testid={`mode-toggle-${option}`}
                      onClick={() => onModeChange?.(option)}
                      disabled={loading}
                      className="rounded-[var(--assessment-radius-pill)] px-3 py-1.5 text-[12px] font-semibold transition-colors"
                      style={{
                        background: active ? 'var(--color-bg-send-btn)' : 'transparent',
                        color: active ? 'var(--color-text-on-send-btn)' : 'var(--color-text-dim)',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.6 : 1,
                      }}
                    >
                      {option === 'build' ? 'Build' : 'Plan'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex w-full items-center justify-end gap-3 min-[900px]:w-auto">
              {latestPlanPath && onApprovePlan && !loading ? (
                <button
                  type="button"
                  data-testid="approve-plan"
                  onClick={() => void approvePlan()}
                  className="flex items-center justify-center rounded-[var(--assessment-radius-pill)] px-3 py-1.5 text-[12px] font-semibold transition-all hover:scale-[1.03]"
                  style={{
                    background: 'rgba(16,185,129,0.15)',
                    color: 'var(--color-brand-green)',
                  }}
                >
                  Approve plan
                </button>
              ) : null}
              {loading ? (
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-[var(--assessment-radius-pill)] transition-colors hover:bg-red-500/20"
                  style={{ background: 'var(--color-bg-stop-btn)', color: 'var(--color-status-error-text)' }}
                  onClick={stopAgent}
                  aria-label="Stop agent"
                  data-testid="stop-button"
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-[var(--assessment-radius-pill)] px-3 py-1.5 text-[12px] font-semibold transition-all hover:scale-[1.05]"
                  style={{
                    background: exhausted || !input.trim() ? 'var(--color-surface-subtle)' : 'var(--color-bg-send-btn)',
                    color: exhausted || !input.trim() ? 'var(--color-text-dimmest)' : 'var(--color-text-on-send-btn)',
                    cursor: exhausted || !input.trim() ? 'not-allowed' : 'pointer',
                  }}
                  onClick={() => void sendMessage()}
                  disabled={exhausted || !input.trim()}
                  aria-label="Send message"
                  data-testid="chat-send"
                >
                  <CornerDownLeft size={16} />
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Usage Bar */}
      <div 
        className="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2 border-none"
        style={{ 
          background: 'transparent'
        }}
      >
        <div className="flex min-w-0 flex-1 items-center justify-start gap-4" style={{ color: 'var(--color-text-main)' }}>
          <div className="shrink-0 flex items-center gap-2 opacity-50">
            <span className="text-[12px] font-medium tracking-tight">{constraints.interactionsRemaining} / {constraints.maxInteractions}</span>
            <MessageSquare size={13} />
          </div>
          {branchItems.length > 0 ? (
            <DropdownMenu
              label="Branch selector"
              role="listbox"
              widthClassName="w-auto"
              menuPositionClassName="left-0 bottom-[calc(100%+10px)] min-w-[180px]"
              triggerClassName="chat-inline-menu-trigger flex h-7 items-center justify-center px-1 py-1 text-left"
              itemClassName="chat-inline-menu-item flex w-full items-center justify-between px-3.5 py-2.5 text-left"
              dataTestId="branch-select"
              items={branchItems}
              trigger={(open) => (
                <DropdownTriggerLabel
                  primary={selectedBranch?.name ?? 'main'}
                  open={open}
                  compact
                />
              )}
            />
          ) : null}
          <div className="relative h-7 w-7 shrink-0">
            {checkpointEditing ? (
              <div
                className="chat-inline-editor absolute left-0 top-1/2 z-10 flex w-[248px] max-w-[min(248px,calc(100vw-1rem))] -translate-y-1/2 items-center justify-start gap-2 px-2 py-1"
                data-testid="checkpoint-editor"
              >
                <span className="inline-flex shrink-0 items-center opacity-70">
                  <Bookmark size={14} />
                </span>
                <input
                  ref={checkpointInputRef}
                  type="text"
                  value={checkpointName}
                  onChange={(event) => setCheckpointName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleSubmitCheckpoint();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      handleCancelCheckpointEdit();
                    }
                  }}
                  placeholder="Checkpoint name"
                  className="chat-inline-editor-input min-w-0 flex-1 bg-transparent text-[12px] outline-none"
                  style={{ color: 'var(--color-text-main)' }}
                  aria-label="Checkpoint name"
                  data-testid="checkpoint-name-input"
                />
                <button
                  type="button"
                  onClick={handleSubmitCheckpoint}
                  disabled={!checkpointName.trim()}
                  className="chat-inline-icon-button"
                  aria-label="Confirm checkpoint"
                  data-testid="confirm-checkpoint"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleCancelCheckpointEdit}
                  className="chat-inline-icon-button"
                  aria-label="Cancel checkpoint"
                  data-testid="cancel-checkpoint"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartCheckpointEdit}
                className="absolute left-0 top-1/2 flex h-7 -translate-y-1/2 items-center justify-center px-1 py-1 text-left chat-inline-menu-trigger"
                data-testid="save-checkpoint"
                aria-label="Save checkpoint"
              >
                <DropdownTriggerLabel
                  primary=""
                  open={false}
                  compact
                  icon={<Bookmark size={14} />}
                />
              </button>
            )}
          </div>
        </div>
        <div ref={contextPanelRef} className="relative flex shrink-0 items-center justify-end">
          <button
            type="button"
            onClick={() => setContextPanelOpen((current) => !current)}
            className="flex items-center gap-2 rounded-full px-2 py-1 transition-colors hover:bg-white/5"
            style={{ color: 'var(--color-text-main)', opacity: 0.82 }}
            data-testid="context-panel-trigger"
          >
            <span className="text-[12px] font-medium tracking-tight">Context</span>
            <div
              className="chat-token-indicator"
              data-testid="token-context-indicator"
              aria-label={`Context window: ${Math.round(contextUsagePct)}% used`}
              title={`Context window: ${Math.round(contextUsagePct)}% used`}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <circle
                  cx="10"
                  cy="10"
                  r={tokenRingRadius}
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="2.5"
                />
                <circle
                  cx="10"
                  cy="10"
                  r={tokenRingRadius}
                  fill="none"
                  stroke={isLowTokens ? 'var(--color-status-error)' : 'rgba(229,229,229,0.72)'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={tokenRingCircumference}
                  strokeDashoffset={tokenRingOffset}
                  transform="rotate(-90 10 10)"
                  style={{ transition: 'stroke-dashoffset 220ms ease, stroke 220ms ease' }}
                />
              </svg>
            </div>
            <ChevronDown
              size={14}
              style={{
                color: 'var(--color-text-dim)',
                transform: contextPanelOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 160ms ease',
              }}
            />
          </button>

          {contextPanelOpen ? (
            <div
              className="absolute bottom-[calc(100%+12px)] right-0 z-30 flex w-[360px] max-h-[min(78vh,calc(100vh-96px))] max-w-[min(94vw,360px)] flex-col overflow-hidden rounded-[22px] border border-white/10 p-0 shadow-2xl"
              style={{ background: 'rgba(19,19,20,0.98)', backdropFilter: 'blur(10px)' }}
              data-testid="context-panel"
            >
              <div className="shrink-0 border-b border-white/8 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[12px] font-medium" style={{ color: 'var(--color-text-main)' }}>
                    Context
                  </div>
                  <button
                    type="button"
                    onClick={() => setContextDetailsOpen((current) => !current)}
                    className="text-[11px] transition-opacity hover:opacity-100"
                    style={{ color: 'var(--color-text-dim)', opacity: 0.8 }}
                  >
                    {contextDetailsOpen ? 'Hide details' : 'View details'}
                  </button>
                </div>
                <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                  Context window: {Math.round(contextUsagePct)}% used
                </div>
                <div className="mt-1 text-[11px] opacity-80" style={{ color: 'var(--color-text-dim)' }}>
                  Using: {attachedSummaryLine}
                </div>
                {contextUsagePct >= 70 ? (
                  <div className="mt-2 text-[11px] opacity-70" style={{ color: 'var(--color-text-dim)' }}>
                    High usage reason: {highUsageReason}
                  </div>
                ) : null}
                {contextDetailsOpen ? (
                  <div
                    className="mt-3 rounded-2xl border border-white/8 px-3 py-3 text-[11px] leading-5"
                    style={{ color: 'var(--color-text-dim)', background: 'var(--color-surface-subtle)' }}
                  >
                    <div>Active chat: {activeConversationTitle}</div>
                    <div>Estimated context tokens: {(contextUsageBreakdown?.context_tokens_estimate ?? 0).toLocaleString()} / {(contextUsageBreakdown?.context_window ?? constraints.contextWindow ?? 0).toLocaleString()}</div>
                    <div>Messages in current chat: {contextUsageBreakdown?.conversation_messages ?? currentChatMessageCount}</div>
                    <div>Repo map attached: {repoMapSelected ? 'yes' : 'no'}</div>
                    <div>Attached files: {selectedFileCount}</div>
                    <div>Attached summaries: {selectedSummaryCount}</div>
                    <div>Attached chat history items: {contextUsageBreakdown?.prior_chat_count ?? 0}</div>
                    {contextUsageBreakdown?.warnings?.map((warning) => (
                      <div key={warning} style={{ color: 'var(--color-status-error)' }}>{warning}</div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="mb-5">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-medium" style={{ color: 'var(--color-text-dim)' }}>
                    <MessageSquare size={11} />
                    Current chat
                  </div>
                  <div
                    className="rounded-2xl border border-white/8 px-3 py-3"
                    style={{ background: 'var(--color-surface-subtle)' }}
                  >
                    <div className="text-[12px]" style={{ color: 'var(--color-text-main)' }}>{activeConversationTitle}</div>
                    <div className="mt-1 text-[11px] opacity-70" style={{ color: 'var(--color-text-dim)' }}>
                      {currentChatMessageCount} messages in this chat
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCreateConversation()}
                        disabled={contextBusy || loading}
                        className="inline-flex items-center gap-1.5 rounded-[var(--assessment-radius-control)] px-3 py-1.5 text-[12px] font-medium transition hover:bg-[var(--color-surface-hover)] disabled:opacity-40"
                        style={{ color: 'var(--color-text-main)', background: 'var(--color-surface-muted)' }}
                        data-testid="new-chat-button"
                      >
                        <Plus size={13} />
                        New chat
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDetachContext()}
                        disabled={contextBusy || contextAttachments.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-[var(--assessment-radius-control)] px-3 py-1.5 text-[12px] font-medium transition hover:bg-[var(--color-surface-hover)] disabled:opacity-40"
                        style={{ color: 'var(--color-text-dim)', background: 'var(--color-surface-subtle)' }}
                        data-testid="clear-chat-button"
                      >
                        <X size={13} />
                        Detach context
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGenerateRepoMap()}
                        disabled={contextBusy}
                        className="inline-flex items-center gap-1.5 rounded-[var(--assessment-radius-control)] px-3 py-1.5 text-[12px] font-medium transition hover:bg-[var(--color-surface-hover)] disabled:opacity-40"
                        style={{ color: 'var(--color-text-dim)', background: 'var(--color-surface-subtle)' }}
                        data-testid="generate-repo-map-button"
                      >
                        <FolderTree size={13} />
                        Update repo map
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGenerateSummary()}
                        disabled={!canSaveSummary}
                        className="inline-flex items-center gap-1.5 rounded-[var(--assessment-radius-control)] px-3 py-1.5 text-[12px] font-medium transition hover:bg-[var(--color-surface-hover)] disabled:opacity-40"
                        style={{ color: 'var(--color-text-dim)', background: 'var(--color-surface-subtle)' }}
                        data-testid="generate-summary-button"
                      >
                        <RefreshCw size={13} className={contextBusy ? 'animate-spin' : ''} />
                        Save chat summary
                      </button>
                    </div>
                    <div className="mt-3 text-[11px] opacity-75" style={{ color: 'var(--color-text-dim)' }}>
                      {canSaveSummary
                        ? 'Save chat summary creates a reusable summary of this chat for later.'
                        : 'No chat content to summarize yet.'}
                    </div>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-medium" style={{ color: 'var(--color-text-dim)' }}>
                    <FileText size={11} />
                    Files
                  </div>
                  <div className="space-y-2">
                    {contextFiles.length > 0 ? contextFiles.map((candidate) => (
                      <button
                        key={candidate.path}
                        type="button"
                        onClick={() => void handleToggleFileContext(candidate)}
                        disabled={contextBusy}
                        className="flex w-full items-center justify-between px-1 py-2 text-left transition hover:opacity-100 disabled:opacity-40"
                        data-testid={`context-file-${candidate.path}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12px]" style={{ color: 'var(--color-text-main)' }}>{candidate.label}</div>
                          <div className="mt-1 text-[11px] opacity-65" style={{ color: 'var(--color-text-dim)' }}>
                            Click to {candidate.selected ? 'remove from' : 'add to'} context
                          </div>
                        </div>
                        {candidate.selected ? <Check size={14} style={{ color: '#4ade80' }} /> : null}
                      </button>
                    )) : (
                      <div className="rounded-2xl px-3 py-2 text-[12px] opacity-55" style={{ color: 'var(--color-text-dim)' }}>
                        Open a file to make it available here.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-5">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-medium" style={{ color: 'var(--color-text-dim)' }}>
                    <Layers3 size={11} />
                    Summaries
                  </div>
                  <div className="space-y-2">
                    {contextResourceCandidates.length > 0 ? contextResourceCandidates.map((candidate) => {
                      const expanded = expandedResourceIds.includes(candidate.id);
                      return (
                        <div key={candidate.id} className="py-1">
                          <div className="flex items-start justify-between gap-3 px-1 py-2">
                            <button
                              type="button"
                              onClick={() => void handleToggleResourceContext(candidate)}
                              disabled={contextBusy}
                              className="min-w-0 flex-1 text-left transition hover:opacity-100 disabled:opacity-40"
                              data-testid={`context-resource-${candidate.id}`}
                            >
                              <div className="truncate text-[12px]" style={{ color: 'var(--color-text-main)' }}>{candidate.title}</div>
                              <div className="mt-1 text-[11px] opacity-65" style={{ color: 'var(--color-text-dim)' }}>
                                {candidate.kind === 'repo_map'
                                  ? 'Repository map'
                                  : `${candidate.source_conversation_title ?? 'Saved summary'}${candidate.message_count ? ` • ${candidate.message_count} messages` : ''}`}
                              </div>
                            </button>
                            <div className="flex shrink-0 items-center gap-3">
                              {candidate.preview ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandedResource(candidate.id)}
                                  className="text-[11px] transition-opacity hover:opacity-100"
                                  style={{ color: 'var(--color-text-dim)', opacity: 0.75 }}
                                >
                                  {expanded ? 'Hide' : 'Preview'}
                                </button>
                              ) : null}
                              {candidate.selected ? <Check size={14} style={{ color: '#4ade80' }} /> : null}
                            </div>
                          </div>
                          {expanded && candidate.preview ? (
                            <div className="px-1 pb-2 text-[11px] leading-5 opacity-80" style={{ color: 'var(--color-text-dim)' }}>
                              {candidate.preview}
                            </div>
                          ) : null}
                        </div>
                      );
                    }) : (
                      <div className="rounded-2xl px-3 py-2 text-[12px] opacity-55" style={{ color: 'var(--color-text-dim)' }}>
                        Generate a repo map or summary to reuse it later.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-medium" style={{ color: 'var(--color-text-dim)' }}>
                    <MessageSquare size={11} />
                    Prior chats
                  </div>
                  <div className="space-y-2">
                    {priorConversationCandidates.length > 0 ? priorConversationCandidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => handleOpenConversation(candidate.id)}
                        disabled={contextBusy}
                        className="flex w-full items-center justify-between px-1 py-2 text-left transition hover:opacity-100 disabled:opacity-40"
                        data-testid={`context-prior-conversation-${candidate.id}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12px]" style={{ color: 'var(--color-text-main)' }}>{candidate.title}</div>
                          <div className="mt-1 text-[11px] opacity-65" style={{ color: 'var(--color-text-dim)' }}>
                            {candidate.descriptor ?? formatConversationTimestamp(candidate.updated_at)} • {formatConversationTimestamp(candidate.updated_at)}
                          </div>
                        </div>
                        {candidate.active ? <Check size={14} style={{ color: '#4ade80' }} /> : null}
                      </button>
                    )) : (
                      <div className="rounded-2xl px-3 py-2 text-[12px] opacity-55" style={{ color: 'var(--color-text-dim)' }}>
                        No earlier chats yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>    </div>
  );
}
