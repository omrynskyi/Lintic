import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCodeStateSnapshot,
  buildConversationEntries,
  describeReviewEvent,
  formatMetricScore,
  getConversationAnchorIndex,
  type ReviewDataPayload,
} from '../lib/review-replay.js';

interface ReviewDashboardProps {
  sessionId: string;
  apiBase?: string;
  isDark: boolean;
  onToggleTheme: () => void;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function triggerJsonDownload(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReviewDashboard({
  sessionId,
  apiBase = '',
  isDark,
  onToggleTheme,
}: ReviewDashboardProps) {
  const [data, setData] = useState<ReviewDataPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const conversationRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(`${apiBase}/api/review/${sessionId}`);
        if (!response.ok) {
          const body = await response.json() as { error?: string };
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        const payload = await response.json() as ReviewDataPayload;
        if (!cancelled) {
          setData(payload);
          setSelectedEventIndex(Math.max(0, payload.recording.events.length - 1));
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load review');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBase, sessionId]);

  const events = data?.recording.events ?? [];
  const selectedEvent = events[selectedEventIndex] ?? null;
  const conversationEntries = useMemo(() => buildConversationEntries(events), [events]);
  const anchorIndex = useMemo(
    () => getConversationAnchorIndex(conversationEntries, selectedEventIndex),
    [conversationEntries, selectedEventIndex],
  );
  const codeState = useMemo(
    () => buildCodeStateSnapshot(events, selectedEventIndex),
    [events, selectedEventIndex],
  );
  const activeCode = codeState.activePath ? codeState.files[codeState.activePath] ?? '' : '';

  useEffect(() => {
    conversationRefs.current[anchorIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [anchorIndex]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-sm" style={{ color: 'var(--color-text-main)' }}>
        Loading review...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-screen flex items-center justify-center px-6">
        <div
          className="max-w-md rounded-2xl px-5 py-4 text-sm"
          style={{
            background: 'var(--color-bg-panel)',
            color: 'var(--color-status-error-text)',
          }}
        >
          {error ?? 'Review data unavailable'}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col" style={{ background: 'var(--color-bg-app)' }}>
      <header
        className="shrink-0 px-5 py-4 flex items-center justify-between gap-4"
        style={{ background: 'var(--color-bg-panel)' }}
      >
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: 'var(--color-text-dim)' }}>
            Review Replay
          </div>
          <h1 className="text-xl font-semibold truncate" style={{ color: 'var(--color-text-bold)', fontFamily: 'Gabarito, sans-serif' }}>
            {data.prompt?.title ?? data.session.prompt_id}
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {data.session.candidate_email}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => triggerJsonDownload(`review-${sessionId}.json`, data)}
            className="rounded-full px-3 py-2 text-xs font-medium"
            style={{
              background: 'var(--color-bg-app)',
              color: 'var(--color-text-main)',
            }}
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="rounded-full px-3 py-2 text-xs font-medium"
            style={{
              background: 'var(--color-bg-app)',
              color: 'var(--color-text-main)',
            }}
          >
            {isDark ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <div className="shrink-0 px-5 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.metrics.map((metric) => (
            <div
              key={metric.name}
              className="rounded-2xl px-4 py-3"
              style={{ background: 'var(--color-bg-panel)' }}
            >
              <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-dim)' }}>
                {metric.label}
              </div>
              <div className="text-2xl font-semibold mt-2" style={{ color: 'var(--color-text-bold)' }}>
                {formatMetricScore(metric.score)}
              </div>
              {metric.details ? (
                <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {metric.details}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 px-5 py-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-dim)' }}>
              Timeline
            </div>
            <div className="text-sm" style={{ color: 'var(--color-text-main)' }}>
              {selectedEvent ? `${describeReviewEvent(selectedEvent)} at ${formatTimestamp(selectedEvent.timestamp)}` : 'No replay events'}
            </div>
          </div>
          <div className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {events.length === 0 ? '0 / 0' : `${selectedEventIndex + 1} / ${events.length}`}
          </div>
        </div>
        <input
          data-testid="timeline-scrubber"
          type="range"
          min={0}
          max={Math.max(0, events.length - 1)}
          value={selectedEventIndex}
          onChange={(event) => setSelectedEventIndex(Number(event.target.value))}
          className="w-full"
        />
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {events.map((event, index) => (
            <button
              key={`${event.timestamp}-${index}`}
              type="button"
              data-testid={`timeline-event-${index}`}
              onClick={() => setSelectedEventIndex(index)}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors"
              style={{
                background: index === selectedEventIndex ? 'var(--color-brand-orange-pale)' : 'var(--color-bg-panel)',
                color: 'var(--color-text-main)',
              }}
            >
              {describeReviewEvent(event)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 grid lg:grid-cols-[1.2fr_0.8fr] gap-0">
        <section className="min-h-0 overflow-auto px-5 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--color-text-dim)' }}>
            Conversation Replay
          </div>
          <div className="flex flex-col gap-3">
            {conversationEntries.map((entry, index) => {
              const isPast = entry.eventIndex <= selectedEventIndex;
              const isAnchor = index === anchorIndex;
              return (
                <div
                  key={entry.id}
                  ref={(node) => { conversationRefs.current[index] = node; }}
                  data-testid={`conversation-entry-${index}`}
                  className="rounded-2xl px-4 py-3"
                  style={{
                    opacity: isPast ? 1 : 0.45,
                    background: entry.title === 'You' ? 'var(--color-bg-user-msg)' : 'var(--color-bg-agent-msg)',
                    boxShadow: isAnchor ? '0 0 0 2px var(--color-brand-orange)' : 'none',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold" style={{ color: 'var(--color-text-bold)' }}>
                      {entry.title}
                    </div>
                    <div className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      {formatTimestamp(entry.timestamp)}
                    </div>
                  </div>
                  <pre
                    className="mt-2 text-xs whitespace-pre-wrap break-words"
                    style={{ color: 'var(--color-text-main)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
                  >
                    {entry.body || 'No content'}
                  </pre>
                </div>
              );
            })}
          </div>
        </section>

        <section className="min-h-0 overflow-auto px-5 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--color-text-dim)' }}>
            Code State
          </div>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-bg-panel)' }}
          >
            <div
              className="px-4 py-3 text-sm font-medium"
              style={{ color: 'var(--color-text-main)', background: 'var(--color-bg-app)' }}
            >
              {codeState.activePath ?? 'No file changes captured yet'}
            </div>
            <div className="grid md:grid-cols-2">
              <div className="min-h-[280px]">
                <div className="px-4 py-2 text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-dim)' }}>
                  Snapshot
                </div>
                <pre
                  data-testid="code-state-content"
                  className="px-4 pb-4 text-xs whitespace-pre-wrap break-words"
                  style={{ color: 'var(--color-text-main)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
                >
                  {activeCode || 'No code snapshot available for this event.'}
                </pre>
              </div>
              <div className="min-h-[280px]">
                <div className="px-4 py-2 text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-dim)' }}>
                  Diff
                </div>
                <pre
                  data-testid="code-state-diff"
                  className="px-4 pb-4 text-xs whitespace-pre-wrap break-words"
                  style={{ color: 'var(--color-text-main)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
                >
                  {codeState.diff ?? 'No diff available for this event.'}
                </pre>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

