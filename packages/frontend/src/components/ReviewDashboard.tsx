import { useEffect, useMemo, useRef, useState } from 'react';
import { 
  BarChart3, 
  Download, 
  Moon, 
  Sun, 
  MessageSquare, 
  Code, 
  History,
  Activity,
  Award,
  ChevronRight,
  Clock,
  User,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  buildCodeStateSnapshot,
  buildConversationEntries,
  describeReviewEvent,
  formatMetricScore,
  getConversationAnchorIndex,
  type ReviewDataPayload,
} from '../lib/review-replay.js';
import { SpiderChart } from './SpiderChart.js';
import { Timeline } from './Timeline.js';

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
      <div className="h-screen flex flex-col items-center justify-center gap-4 text-sm" style={{ background: 'var(--color-bg-app)', color: 'var(--color-text-main)' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        >
          <Activity size={32} className="text-[var(--color-brand-orange)]" />
        </motion.div>
        Loading review session...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-screen flex items-center justify-center px-6" style={{ background: 'var(--color-bg-app)' }}>
        <div
          className="max-w-md rounded-2xl px-6 py-6 border border-[var(--color-status-error)]/20"
          style={{
            background: 'var(--color-bg-panel)',
            color: 'var(--color-status-error)',
          }}
        >
          <h3 className="font-semibold mb-2">Error Loading Review</h3>
          <p className="text-sm opacity-80">{error ?? 'Review data unavailable'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col selection:bg-[var(--color-brand-orange)]/30" style={{ background: 'var(--color-bg-app)' }}>
      {/* Header */}
      <header
        className="shrink-0 px-6 py-4 flex items-center justify-between border-b border-[var(--color-border-main)]"
        style={{ background: 'var(--color-bg-panel)' }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-brand-orange)]/10 flex items-center justify-center shrink-0">
            <Zap size={24} className="text-[var(--color-brand-orange)]" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: 'var(--color-text-dim)' }}>
              Evaluation Report
            </div>
            <h1 className="text-xl font-bold truncate tracking-tight mt-0.5" style={{ color: 'var(--color-text-bold)', fontFamily: 'Inter, sans-serif' }}>
              {data.prompt?.title ?? data.session.prompt_id}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => triggerJsonDownload(`review-${sessionId}.json`, data)}
            className="group flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all hover:bg-[var(--color-bg-app)]"
            style={{
              background: 'var(--color-bg-app)',
              color: 'var(--color-text-main)',
              border: '1px solid var(--color-border-main)'
            }}
          >
            <Download size={14} className="group-hover:translate-y-0.5 transition-transform" />
            Export Data
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex items-center justify-center w-9 h-9 rounded-xl transition-all"
            style={{
              background: 'var(--color-bg-app)',
              color: 'var(--color-text-main)',
              border: '1px solid var(--color-border-main)'
            }}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1600px] mx-auto p-6 flex flex-col gap-6">
          
          {/* Top Hero Section: Profile & Spider Chart */}
          <div className="grid lg:grid-cols-[1fr_350px] gap-6">
            <div className="flex flex-col gap-6">
              {/* Candidate Card */}
              <section className="rounded-[32px] p-8 flex flex-col md:flex-row md:items-center justify-between gap-8" 
                style={{ background: 'var(--color-bg-panel)', border: '1px solid var(--color-border-main)' }}>
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-[28px] bg-gradient-to-br from-[var(--color-brand-orange)] to-[var(--color-brand-yellow)] flex items-center justify-center text-white shadow-xl shadow-orange-950/20">
                    <User size={40} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-bold)' }}>Candidate Profile</h2>
                    <p className="text-[var(--color-text-muted)] flex items-center gap-2 mt-1">
                      <Clock size={14} />
                      Completed on {new Date(data.session.created_at).toLocaleDateString()}
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/5 border border-white/10" style={{ color: 'var(--color-text-main)' }}>
                        {data.session.candidate_email}
                      </div>
                      <div className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[var(--color-brand-green)]/10 border border-[var(--color-brand-green)]/20 text-[var(--color-brand-green)]">
                        {data.session.status}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: 'var(--color-text-dim)' }}>
                      Overall Score
                    </div>
                    <div className="text-5xl font-black mt-1 tabular-nums tracking-tighter" style={{ color: 'var(--color-brand-orange)' }}>
                      {formatMetricScore(data.session.score ?? 0)}
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-full border-4 border-[var(--color-brand-orange)]/20 border-t-[var(--color-brand-orange)] animate-[spin_3s_linear_infinite]" />
                </div>
              </section>

              {/* Small Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {data.metrics.map((metric) => (
                  <div
                    key={metric.name}
                    className="rounded-[24px] p-5 border border-[var(--color-border-muted)] flex flex-col justify-between group hover:border-[var(--color-brand-orange)]/30 transition-colors"
                    style={{ background: 'var(--color-bg-panel)' }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-[11px] uppercase tracking-widest font-bold" style={{ color: 'var(--color-text-dim)' }}>
                        {metric.label}
                      </div>
                      <Award size={16} className="text-[var(--color-text-dimmest)] group-hover:text-[var(--color-brand-orange)] transition-colors" />
                    </div>
                    <div className="mt-4">
                      <div className="text-3xl font-bold tracking-tight" style={{ color: 'var(--color-text-bold)' }}>
                        {formatMetricScore(metric.score)}
                      </div>
                      <div className="text-xs mt-1 leading-relaxed line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                        {metric.details || 'Baseline performance metrics'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Radar Chart Panel */}
            <section className="rounded-[32px] p-6 flex flex-col items-center justify-center border border-[var(--color-border-main)]" 
              style={{ background: 'var(--color-bg-panel)' }}>
              <div className="text-[11px] uppercase tracking-[0.2em] font-bold mb-6 w-full text-center" style={{ color: 'var(--color-text-dim)' }}>
                Metric Distribution
              </div>
              <SpiderChart metrics={data.metrics} size={280} />
            </section>
          </div>

          {/* Timeline Section */}
          <section className="rounded-[32px] p-8 border border-[var(--color-border-main)]" 
            style={{ background: 'var(--color-bg-panel)' }}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <History size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-bold)' }}>Session Timeline</h3>
                  <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {selectedEvent ? (
                      <span className="flex items-center gap-2">
                        {describeReviewEvent(selectedEvent)} 
                        <span className="w-1 h-1 rounded-full bg-[var(--color-text-dimmest)]" />
                        {formatTimestamp(selectedEvent.timestamp)}
                      </span>
                    ) : 'No events recorded'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-[var(--color-bg-app)] px-4 py-2 rounded-xl border border-[var(--color-border-muted)]">
                <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--color-text-dim)]">Event</span>
                <span className="text-sm font-black tabular-nums" style={{ color: 'var(--color-brand-orange)' }}>
                  {events.length === 0 ? '0 / 0' : `${selectedEventIndex + 1} / ${events.length}`}
                </span>
              </div>
            </div>
            
            <Timeline 
              events={events} 
              selectedEventIndex={selectedEventIndex} 
              onSelectEvent={setSelectedEventIndex} 
            />
          </section>

          {/* Bottom Grid: Conversation & Code */}
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6 min-h-[600px]">
            {/* Conversation Panel */}
            <section className="flex flex-col rounded-[32px] border border-[var(--color-border-main)] overflow-hidden" 
              style={{ background: 'var(--color-bg-panel)' }}>
              <div className="px-6 py-5 border-b border-[var(--color-border-main)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare size={18} className="text-[var(--color-brand-orange)]" />
                  <h3 className="font-bold" style={{ color: 'var(--color-text-bold)' }}>Conversation Replay</h3>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6 flex flex-col gap-4 no-scrollbar">
                {conversationEntries.map((entry, index) => {
                  const isPast = entry.eventIndex <= selectedEventIndex;
                  const isAnchor = index === anchorIndex;
                  const isUser = entry.title === 'You';
                  
                  return (
                    <motion.div
                      key={entry.id}
                      ref={(node) => { conversationRefs.current[index] = node; }}
                      initial={false}
                      animate={{ 
                        opacity: isPast ? 1 : 0.3,
                        scale: isAnchor ? 1.02 : 1,
                        x: isAnchor ? 0 : isPast ? 0 : 4
                      }}
                      className={`rounded-2xl p-5 transition-all relative ${isAnchor ? 'ring-2 ring-[var(--color-brand-orange)] shadow-lg shadow-orange-950/20' : ''}`}
                      style={{
                        background: isUser ? 'var(--color-bg-user-msg)' : 'var(--color-bg-agent-msg)',
                        border: isAnchor ? 'none' : '1px solid var(--color-border-muted)',
                        alignSelf: isUser ? 'flex-end' : 'flex-start',
                        maxWidth: '90%'
                      }}
                    >
                      <div className="flex items-center justify-between gap-6 mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isUser ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {isUser ? <User size={12} /> : <Zap size={12} />}
                          </div>
                          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-bold)' }}>
                            {isUser ? 'Candidate' : 'Lintic Agent'}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono opacity-50">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap break-words opacity-90" 
                        style={{ color: 'var(--color-text-main)', fontFamily: 'Inter, sans-serif' }}>
                        {entry.body || <span className="italic opacity-50">No text content</span>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {/* Code State Panel */}
            <section className="flex flex-col rounded-[32px] border border-[var(--color-border-main)] overflow-hidden" 
              style={{ background: 'var(--color-bg-panel)' }}>
              <div className="px-6 py-5 border-b border-[var(--color-border-main)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Code size={18} className="text-blue-400" />
                  <h3 className="font-bold" style={{ color: 'var(--color-text-bold)' }}>Code Context</h3>
                </div>
                {codeState.activePath && (
                  <div className="text-[11px] font-mono px-3 py-1 rounded-md bg-[var(--color-bg-app)] border border-[var(--color-border-muted)]" style={{ color: 'var(--color-text-muted)' }}>
                    {codeState.activePath}
                  </div>
                )}
              </div>
              
              <div className="flex-1 overflow-hidden grid grid-rows-[1fr_1fr]">
                {/* Snapshot */}
                <div className="border-b border-[var(--color-border-main)] flex flex-col min-h-0">
                  <div className="px-6 py-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-dim)] bg-[var(--color-bg-app)]/50">
                    <Activity size={10} />
                    Current Snapshot
                  </div>
                  <div className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed" style={{ background: 'var(--color-bg-code)' }}>
                    <AnimatePresence mode="wait">
                      <motion.pre
                        key={(codeState.activePath ?? 'null') + selectedEventIndex}
                        data-testid="code-state-content"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="whitespace-pre-wrap break-words"
                        style={{ color: 'var(--color-text-main)' }}
                      >
                        {activeCode || 'No code snapshot available for this state.'}
                      </motion.pre>
                    </AnimatePresence>
                  </div>
                </div>

                {/* Diff */}
                <div className="flex flex-col min-h-0">
                  <div className="px-6 py-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-dim)] bg-[var(--color-bg-app)]/50">
                    <BarChart3 size={10} />
                    Last Change Diff
                  </div>
                  <div className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed" style={{ background: 'var(--color-bg-code)' }}>
                    <AnimatePresence mode="wait">
                      <motion.pre
                        key={(codeState.activePath ?? 'null') + '-diff-' + selectedEventIndex}
                        data-testid="code-state-diff"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="whitespace-pre-wrap break-words"
                      >
                        {codeState.diff ? (
                          codeState.diff.split('\n').map((line, i) => (
                            <div 
                              key={i} 
                              className={line.startsWith('+') ? 'text-[var(--color-status-success)]' : line.startsWith('-') ? 'text-[var(--color-status-error)]' : 'opacity-50'}
                            >
                              {line}
                            </div>
                          ))
                        ) : (
                          <span className="italic opacity-30">No diff available for this event.</span>
                        )}
                      </motion.pre>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
