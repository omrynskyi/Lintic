import type { PromptSummary } from '@lintic/core';
import { getWebContainer } from './webcontainer.js';

const STORAGE_KEY = 'lintic_session';

export interface PersistedSession {
  sessionId: string;
  sessionToken: string;
  prompt: PromptSummary;
}

export interface RestoredConstraints {
  tokensRemaining: number;
  interactionsRemaining: number;
  secondsRemaining: number;
  maxTokens: number;
  maxInteractions: number;
  timeLimitSeconds: number;
}

export interface SessionSummaryStats {
  tokensUsed: number;
  maxTokens: number;
  interactionsUsed: number;
  maxInteractions: number;
  startedAt: number;
  submittedAt?: number;
  timeSpentSeconds: number;
}

export type SessionValidationResult =
  | {
      status: 'active';
      constraints: RestoredConstraints;
      stats: SessionSummaryStats;
    }
  | {
      status: 'submitted';
      stats: SessionSummaryStats;
    };

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(): StorageLike | null {
  const candidate = (globalThis as { localStorage?: unknown }).localStorage;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    typeof (candidate as StorageLike).getItem !== 'function' ||
    typeof (candidate as StorageLike).setItem !== 'function' ||
    typeof (candidate as StorageLike).removeItem !== 'function'
  ) {
    return null;
  }

  return candidate as StorageLike;
}

export function saveSession(session: PersistedSession): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch { /* ignore storage errors */ }
}

export function loadSession(): PersistedSession | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(STORAGE_KEY);
}

export async function validateSession(
  sessionId: string,
  sessionToken: string,
  apiBase = '',
): Promise<SessionValidationResult | null> {
  try {
    const res = await fetch(`${apiBase}/api/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      session: {
        status: string;
        created_at: number;
        closed_at?: number;
        tokens_used: number;
        interactions_used: number;
        constraint: {
          max_session_tokens: number;
          max_interactions: number;
          time_limit_minutes: number;
        };
      };
      constraints_remaining: {
        tokens_remaining: number;
        interactions_remaining: number;
        seconds_remaining: number;
      };
    };
    const stats: SessionSummaryStats = {
      tokensUsed: data.session.tokens_used,
      maxTokens: data.session.constraint.max_session_tokens,
      interactionsUsed: data.session.interactions_used,
      maxInteractions: data.session.constraint.max_interactions,
      startedAt: data.session.created_at,
      ...(data.session.closed_at ? { submittedAt: data.session.closed_at } : {}),
      timeSpentSeconds: Math.max(
        0,
        Math.floor(((data.session.closed_at ?? Date.now()) - data.session.created_at) / 1000),
      ),
    };

    if (data.session.status === 'completed') {
      return {
        status: 'submitted',
        stats,
      };
    }

    if (data.session.status !== 'active') return null;

    return {
      status: 'active',
      stats,
      constraints: {
      tokensRemaining: data.constraints_remaining.tokens_remaining,
      interactionsRemaining: data.constraints_remaining.interactions_remaining,
      secondsRemaining: data.constraints_remaining.seconds_remaining,
      maxTokens: data.session.constraint.max_session_tokens,
      maxInteractions: data.session.constraint.max_interactions,
      timeLimitSeconds: data.session.constraint.time_limit_minutes * 60,
      },
    };
  } catch {
    return null;
  }
}

export async function restoreFiles(
  sessionId: string,
  sessionToken: string,
  apiBase = '',
): Promise<void> {
  try {
    const res = await fetch(`${apiBase}/api/sessions/${sessionId}/messages`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!res.ok) return;
    const data = await res.json() as {
      messages: Array<{ role: string; content: string }>;
    };

    const wc = await getWebContainer();

    for (const msg of data.messages) {
      if (msg.role !== 'assistant') continue;
      try {
        const parsed = JSON.parse(msg.content) as {
          __type?: string;
          tool_calls?: Array<{ name: string; input: unknown }>;
        };
        if (parsed.__type !== 'tool_use' || !Array.isArray(parsed.tool_calls)) continue;
        for (const tc of parsed.tool_calls) {
          if (tc.name !== 'write_file') continue;
          const { path, content } = tc.input as { path: string; content: string };
          const lastSlash = path.lastIndexOf('/');
          if (lastSlash > 0) {
            try { await wc.fs.mkdir(path.slice(0, lastSlash), { recursive: true }); } catch { /* ignore */ }
          }
          await wc.fs.writeFile(path, content);
        }
      } catch { /* ignore non-JSON or malformed messages */ }
    }
  } catch { /* ignore all restore errors */ }
}
