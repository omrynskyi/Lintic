import { useEffect, useState } from 'react';
import type { PromptSummary } from '@lintic/core';

interface AssessmentLinkLoaderProps {
  token: string;
  apiBase?: string;
  onConsumed: (session: {
    sessionId: string;
    sessionToken: string;
    prompt: PromptSummary;
    agent?: { provider: string; model: string };
  }) => void;
}

type ConsumeResponse = {
  session_id?: string;
  token?: string;
  prompt?: PromptSummary;
  agent?: { provider: string; model: string };
  error?: string;
};

const pendingConsumeRequests = new Map<string, Promise<ConsumeResponse>>();

function consumeAssessmentLink(apiBase: string, token: string): Promise<ConsumeResponse> {
  const cacheKey = `${apiBase}::${token}`;
  const existing = pendingConsumeRequests.get(cacheKey);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    const response = await fetch(`${apiBase}/api/links/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    let body: ConsumeResponse;
    if (typeof response.text === 'function') {
      const rawBody = await response.text();
      try {
        body = JSON.parse(rawBody) as ConsumeResponse;
      } catch {
        throw new Error(`Unexpected non-JSON response (HTTP ${response.status})`);
      }
    } else {
      body = await response.json() as ConsumeResponse;
    }
    if (!response.ok) {
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }

    return body;
  })();

  pendingConsumeRequests.set(cacheKey, request);
  request.then(
    () => {
      pendingConsumeRequests.delete(cacheKey);
    },
    () => {
      pendingConsumeRequests.delete(cacheKey);
    },
  );
  return request;
}

export function AssessmentLinkLoader({
  token,
  apiBase = '',
  onConsumed,
}: AssessmentLinkLoaderProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const body = await consumeAssessmentLink(apiBase, token);
        if (!body.session_id || !body.token || !body.prompt) {
          throw new Error(body.error ?? 'Failed to start assessment');
        }

        if (!cancelled) {
          onConsumed({
            sessionId: body.session_id,
            sessionToken: body.token,
            prompt: body.prompt,
            agent: body.agent,
          });
        }
      } catch (consumeError) {
        if (!cancelled) {
          setError(consumeError instanceof Error ? consumeError.message : 'Failed to start assessment');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBase, onConsumed, token]);

  return (
    <div
      className="h-screen flex items-center justify-center px-6"
      style={{ background: 'var(--color-bg-app)' }}
      data-testid="assessment-loader"
    >
      <div
        className="max-w-md rounded-2xl px-5 py-4 text-sm"
        style={{
          background: 'var(--color-bg-panel)',
          color: error ? 'var(--color-status-error-text)' : 'var(--color-text-main)',
        }}
      >
        {error ?? 'Starting assessment...'}
      </div>
    </div>
  );
}
