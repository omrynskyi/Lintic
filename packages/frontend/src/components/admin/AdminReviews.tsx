import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Columns2,
  ExternalLink,
  FlaskConical,
  Loader,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { fetchAdminJson, useAdminKey } from './AdminKeyContext.js';
import type {
  AdminReviewRow,
  AdminReviewsResponse,
  SessionReviewStatus,
} from '@lintic/core';
import type { ReviewDataPayload, ReviewEvaluationResult } from '../../lib/review-replay.js';
import { formatMetricScore } from '../../lib/review-replay.js';
import { ReviewDashboard } from '../ReviewDashboard.js';

const STAGED_COMPARISON_STORAGE_KEY = 'lintic_staged_comparison_sessions_v1';

interface ReviewGroup {
  prompt_id: string;
  prompt_title: string;
  reviews: AdminReviewRow[];
}

interface ComparisonDetailState {
  data?: ReviewDataPayload | null;
  loading?: boolean;
  evaluating?: boolean;
  error?: string | null;
}

interface SharedCompareSectionProps {
  title: string;
  candidateCount: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

interface AdminReviewsProps {
  initialSessionId?: string | null;
  isDark: boolean;
  onToggleTheme: () => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function reviewStatusLabel(status: SessionReviewStatus): string {
  if (status === 'reviewed') return 'Reviewed';
  if (status === 'viewed') return 'Viewed';
  return 'Unviewed';
}

function reviewStatusColor(status: SessionReviewStatus): string {
  if (status === 'reviewed') return 'var(--color-status-success)';
  if (status === 'viewed') return '#F59E0B';
  return 'var(--color-text-dim)';
}

function getScoreColor(score?: number): string {
  if (score == null) return 'rgba(148,163,184,0.45)';
  if (score >= 0.7) return '#10B981';
  if (score >= 0.4) return '#F59E0B';
  return '#EF4444';
}

function getTenPointColor(score: number): string {
  return score >= 7 ? '#10B981' : score >= 4 ? '#F59E0B' : '#EF4444';
}

function getPercentColor(score: number): string {
  return score >= 80 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';
}

function loadStagedSelections(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STAGED_COMPARISON_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return Object.fromEntries(
      Object.entries(parsed).map(([promptId, sessionIds]) => [
        promptId,
        Array.isArray(sessionIds) ? sessionIds.filter((value) => typeof value === 'string') : [],
      ]),
    );
  } catch {
    return {};
  }
}

function persistStagedSelections(value: Record<string, string[]>) {
  try {
    localStorage.setItem(STAGED_COMPARISON_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore localStorage failures
  }
}

function ScoreMarker({ score }: { score?: number }) {
  if (score == null) {
    return null;
  }

  const color = getScoreColor(score);

  return (
    <div
      className="flex shrink-0 items-center gap-2"
      title={`Session analysis average ${formatMetricScore(score)}`}
    >
      <div
        className="h-3 w-3 rounded-full border-2"
        style={{ borderColor: color }}
      />
      <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
        {Math.round(score * 100)}
      </span>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (nextOpen: boolean) => void;
  children: React.ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;

  if (count === 0) {
    return null;
  }

  return (
    <section>
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          if (controlledOpen === undefined) {
            setUncontrolledOpen(nextOpen);
          }
          onToggle?.(nextOpen);
        }}
        className="flex w-full items-center gap-3 py-2 text-left"
      >
        {open ? (
          <ChevronDown size={14} style={{ color: 'var(--color-text-dim)' }} />
        ) : (
          <ChevronRight size={14} style={{ color: 'var(--color-text-dim)' }} />
        )}
        <div className="text-[12px] font-semibold" style={{ color: 'var(--color-text-main)' }}>
          {title} ({count})
        </div>
      </button>
      {open ? <div className="pt-2">{children}</div> : null}
    </section>
  );
}

function ReviewRowCard({
  review,
  isStaged,
  archivedView,
  mutating,
  onOpenReview,
  onToggleStage,
  onArchive,
  onDelete,
}: {
  review: AdminReviewRow;
  isStaged: boolean;
  archivedView: boolean;
  mutating: boolean;
  onOpenReview: (review: AdminReviewRow) => void;
  onToggleStage: (review: AdminReviewRow) => void;
  onArchive: (review: AdminReviewRow) => void;
  onDelete: (review: AdminReviewRow) => void;
}) {
  return (
    <article
      className="cursor-pointer rounded-xl px-4 py-3"
      style={{ background: 'var(--color-bg-panel)' }}
      onDoubleClick={() => onOpenReview(review)}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-[13px] font-semibold" style={{ color: 'var(--color-text-main)' }}>
                {review.candidate_email}
              </div>
              <ScoreMarker score={review.session_score} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
              <span>Completed {relativeTime(review.completed_at)}</span>
              <span style={{ color: reviewStatusColor(review.review_status) }}>
                {reviewStatusLabel(review.review_status)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {archivedView ? (
              <button
                type="button"
                disabled={mutating}
                aria-label="Delete permanently"
                title="Delete permanently"
                className="rounded-xl p-2 text-[11px] font-medium disabled:opacity-40"
                style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--color-status-error)' }}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(review);
                }}
              >
                <Trash2 size={13} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={mutating}
                  aria-label={isStaged ? 'Remove from comparison' : 'Stage for comparison'}
                  title={isStaged ? 'Remove from comparison' : 'Stage for comparison'}
                  className="rounded-xl p-2 text-[11px] font-medium disabled:opacity-40"
                  style={{
                    background: isStaged ? 'rgba(16,185,129,0.12)' : 'rgba(56,135,206,0.1)',
                    color: isStaged ? 'var(--color-status-success)' : 'var(--color-brand)',
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleStage(review);
                  }}
                >
                  {isStaged ? <X size={13} /> : <Columns2 size={13} />}
                </button>
                <button
                  type="button"
                  disabled={mutating}
                  aria-label="Archive review"
                  title="Archive review"
                  className="rounded-xl p-2 text-[11px] font-medium disabled:opacity-40"
                  style={{ background: 'var(--color-bg-app)', color: 'var(--color-text-muted)' }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onArchive(review);
                  }}
                >
                  <Archive size={13} />
                </button>
              </>
            )}
            <button
              type="button"
              disabled={mutating}
              aria-label="Open review"
              title="Open review"
              className="rounded-xl p-2 text-[11px] font-medium disabled:opacity-40"
              style={{ background: 'var(--color-bg-panel)', color: 'var(--color-text-muted)' }}
              onClick={(event) => {
                event.stopPropagation();
                onOpenReview(review);
              }}
            >
              <ExternalLink size={13} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function SharedCompareSection({
  title,
  candidateCount,
  defaultOpen = true,
  children,
}: SharedCompareSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 py-1 text-left"
      >
        {open ? (
          <ChevronDown size={14} style={{ color: 'var(--color-text-dim)' }} />
        ) : (
          <ChevronRight size={14} style={{ color: 'var(--color-text-dim)' }} />
        )}
        <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-main)' }}>
          {title}
        </div>
        <div className="text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
          {candidateCount} candidates
        </div>
      </button>
      {open ? <div className="pt-2">{children}</div> : null}
    </section>
  );
}

function CompareCandidateHeader({
  review,
  onOpenReview,
  onToggleStage,
}: {
  review: AdminReviewRow;
  onOpenReview: (review: AdminReviewRow) => void;
  onToggleStage: (review: AdminReviewRow) => void;
}) {
  return (
    <section className="rounded-xl px-4 py-4" style={{ background: 'var(--color-bg-panel)' }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--color-text-main)' }}>
            {review.candidate_email}
          </div>
          <ScoreMarker score={review.session_score} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
          <span>{reviewStatusLabel(review.review_status)}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          aria-label="Open review"
          title="Open review"
          className="rounded-xl p-2 text-[11px] font-medium"
          style={{ background: 'rgba(56,135,206,0.1)', color: 'var(--color-brand)' }}
          onClick={() => onOpenReview(review)}
        >
          <ExternalLink size={13} />
        </button>
        <button
          type="button"
          aria-label="Remove from comparison"
          title="Remove from comparison"
          className="rounded-xl p-2 text-[11px] font-medium"
          style={{ background: 'var(--color-bg-app)', color: 'var(--color-text-muted)' }}
          onClick={() => onToggleStage(review)}
        >
          <X size={13} />
        </button>
      </div>
    </section>
  );
}

function ComparisonSectionCard({
  children,
  error,
  loading,
}: {
  children?: React.ReactNode;
  error?: string | null;
  loading?: boolean;
}) {
  return (
    <section className="rounded-xl px-4 py-4" style={{ background: 'var(--color-bg-panel)' }}>
      {loading ? (
        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
          <Loader size={12} className="animate-spin" />
          Loading session analysis…
        </div>
      ) : error ? (
        <div className="text-[11px]" style={{ color: 'var(--color-status-error)' }}>
          {error}
        </div>
      ) : children ? (
        children
      ) : (
        <div className="text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
          This candidate has not been analyzed yet.
        </div>
      )}
    </section>
  );
}

function SynchronizedCriterionRow({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 py-1.5 text-left"
      >
        {open ? (
          <ChevronDown size={13} style={{ color: 'var(--color-text-dim)' }} />
        ) : (
          <ChevronRight size={13} style={{ color: 'var(--color-text-dim)' }} />
        )}
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>
          {title}
        </div>
      </button>
      {open ? <div className="pt-2">{children}</div> : null}
    </section>
  );
}

function ComparisonIterationRow({
  review,
  detail,
  iterationIndex,
}: {
  review: AdminReviewRow;
  detail: ComparisonDetailState | undefined;
  iterationIndex: number;
}) {
  const result: ReviewEvaluationResult | null = detail?.data?.evaluation?.result ?? null;
  const item = result?.iterations[iterationIndex];

  return (
    <ComparisonSectionCard loading={detail?.loading} error={detail?.error}>
      {item ? (
        <div>
          <div className="text-[12px] font-medium" style={{ color: 'var(--color-text-main)' }}>
            {item.message_count} messages
          </div>
          {item.user_messages[0] ? (
            <div className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
              {item.user_messages[0]}
            </div>
          ) : null}
          {item.rewound_at ? (
            <div className="mt-2 text-[11px]" style={{ color: '#F59E0B' }}>
              Rewound during this iteration
            </div>
          ) : null}
        </div>
      ) : null}
    </ComparisonSectionCard>
  );
}

function ComparisonSummaryCard({ detail }: { detail: ComparisonDetailState | undefined }) {
  const result = detail?.data?.evaluation?.result ?? null;
  return (
    <ComparisonSectionCard loading={detail?.loading} error={detail?.error}>
      {result ? (
        <div className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-main)' }}>
          {result.llm_evaluation.overall_summary}
        </div>
      ) : null}
    </ComparisonSectionCard>
  );
}

function ComparisonLlmScoresCard({ detail }: { detail: ComparisonDetailState | undefined }) {
  const result = detail?.data?.evaluation?.result ?? null;
  return (
    <ComparisonSectionCard loading={detail?.loading} error={detail?.error}>
      {result ? (
        <div className="space-y-2.5">
          {result.llm_evaluation.scores.map((item) => {
            const color = getTenPointColor(item.score);
            return (
              <div key={item.dimension} className="rounded-xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-main)' }}>
                    {item.label}
                  </span>
                  <span className="text-[14px] font-bold tabular-nums" style={{ color }}>
                    {item.score.toFixed(1)}<span className="text-[10px] opacity-50">/10</span>
                  </span>
                </div>
                <div className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
                  {item.rationale}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </ComparisonSectionCard>
  );
}

function ComparisonAcceptanceCriteriaCard({ detail }: { detail: ComparisonDetailState | undefined }) {
  const items = detail?.data?.evaluation?.result.llm_evaluation.acceptance_criteria_results ?? [];
  return (
    <ComparisonSectionCard loading={detail?.loading} error={detail?.error}>
      {items.length > 0 ? (
        <div className="space-y-2.5">
          {items.map((item) => {
            const color = getPercentColor(item.score);
            return (
              <div key={item.criterion} className="rounded-xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="flex items-center gap-3">
                  <div className="h-[4px] w-16 shrink-0 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full" style={{ width: `${item.score}%`, background: color }} />
                  </div>
                  <span className="flex-1 text-[12px] font-medium" style={{ color: 'var(--color-text-main)' }}>
                    {item.criterion}
                  </span>
                  <span className="text-[13px] font-bold tabular-nums" style={{ color }}>
                    {item.score}<span className="text-[10px] opacity-50">%</span>
                  </span>
                </div>
                <div className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
                  {item.rationale}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </ComparisonSectionCard>
  );
}

function ComparisonRubricCard({ detail }: { detail: ComparisonDetailState | undefined }) {
  const items = detail?.data?.evaluation?.result.llm_evaluation.rubric_scores ?? [];
  return (
    <ComparisonSectionCard loading={detail?.loading} error={detail?.error}>
      {items.length > 0 ? (
        <div className="space-y-2.5">
          {items.map((item) => {
            const color = getTenPointColor(item.score);
            return (
              <div key={item.question} className="rounded-xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-main)' }}>
                    {item.question}
                  </span>
                  <span className="text-[14px] font-bold tabular-nums" style={{ color }}>
                    {item.score.toFixed(1)}<span className="text-[10px] opacity-50">/10</span>
                  </span>
                </div>
                <div className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
                  {item.rationale}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </ComparisonSectionCard>
  );
}

function ComparisonInfrastructureCard({ detail }: { detail: ComparisonDetailState | undefined }) {
  const result = detail?.data?.evaluation?.result ?? null;
  const items = result ? [
    result.infrastructure.caching_effectiveness,
    result.infrastructure.error_handling_coverage,
    result.infrastructure.scaling_awareness,
  ] : [];
  return (
    <ComparisonSectionCard loading={detail?.loading} error={detail?.error}>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => {
            const pct = Math.round(item.score * 100);
            const color = getScoreColor(item.score);
            return (
              <div key={item.name}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-main)' }}>
                    {item.label}
                  </span>
                  <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
                    {pct}%
                  </span>
                </div>
                <div className="h-[4px] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
                <div className="mt-1.5 text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                  {item.details}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </ComparisonSectionCard>
  );
}

function ComparisonIterationsCard({
  review,
  detail,
}: {
  review: AdminReviewRow;
  detail: ComparisonDetailState | undefined;
}) {
  const result: ReviewEvaluationResult | null = detail?.data?.evaluation?.result ?? null;
  const iterationCount = result?.iterations.length ?? 0;
  return (
    <ComparisonSectionCard loading={detail?.loading} error={detail?.error}>
      {result ? (
        <div className="space-y-2">
          <div className="text-[12px] font-medium" style={{ color: 'var(--color-text-main)' }}>
            {iterationCount} iteration{iterationCount === 1 ? '' : 's'}
          </div>
          {result.iterations.map((item) => (
            <div key={`${review.session_id}-${item.index}`} className="rounded-xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-[12px] font-medium" style={{ color: 'var(--color-text-main)' }}>
                Iteration {item.index + 1}
              </div>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                {item.message_count} messages
              </div>
              {item.user_messages[0] ? (
                <div className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
                  {item.user_messages[0]}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </ComparisonSectionCard>
  );
}

export function AdminReviews({ initialSessionId, isDark, onToggleTheme }: AdminReviewsProps) {
  const { adminKey } = useAdminKey();
  const [reviews, setReviews] = useState<AdminReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(initialSessionId ?? null);
  const [mutatingSessionId, setMutatingSessionId] = useState<string | null>(null);
  const [handledInitialSessionId, setHandledInitialSessionId] = useState(false);
  const [comparisonOpenByPrompt, setComparisonOpenByPrompt] = useState<Record<string, boolean>>({});
  const [stagedByPrompt, setStagedByPrompt] = useState<Record<string, string[]>>(() => loadStagedSelections());
  const [comparisonDetailsBySession, setComparisonDetailsBySession] = useState<Record<string, ComparisonDetailState>>({});
  const [showArchived, setShowArchived] = useState(false);

  function updateReviewStatusLocally(sessionId: string, status: SessionReviewStatus) {
    setReviews((prev) => prev.map((review) => (
      review.session_id === sessionId
        ? { ...review, review_status: status }
        : review
    )));
  }

  function removeSessionFromLocalState(sessionId: string) {
    setReviews((prev) => prev.filter((review) => review.session_id !== sessionId));
    setComparisonDetailsBySession((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setStagedByPrompt((prev) => Object.fromEntries(
      Object.entries(prev).map(([promptId, sessionIds]) => [
        promptId,
        sessionIds.filter((value) => value !== sessionId),
      ]),
    ));
  }

  function load() {
    if (!adminKey) return;
    setLoading(true);
    setError(null);
    const path = showArchived ? '/api/reviews?archived=true' : '/api/reviews';
    fetchAdminJson<AdminReviewsResponse>(path, adminKey)
      .then((response) => setReviews(response.reviews))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [adminKey, showArchived]);

  useEffect(() => {
    persistStagedSelections(stagedByPrompt);
  }, [stagedByPrompt]);

  useEffect(() => {
    Object.entries(comparisonOpenByPrompt).forEach(([promptId, isOpen]) => {
      if (isOpen) {
        ensureComparisonDetails(stagedByPrompt[promptId] ?? []);
      }
    });
  }, [comparisonOpenByPrompt, stagedByPrompt]);

  async function markViewed(sessionId: string) {
    if (!adminKey) return;
    setMutatingSessionId(sessionId);
    try {
      const response = await fetchAdminJson<{ review_state: { status: SessionReviewStatus } }>(
        `/api/reviews/${sessionId}/viewed`,
        adminKey,
        { method: 'POST' },
      );
      updateReviewStatusLocally(sessionId, response.review_state.status);
    } finally {
      setMutatingSessionId(null);
    }
  }

  async function openReview(row: AdminReviewRow) {
    if (row.review_status === 'unviewed') {
      await markViewed(row.session_id);
    }
    setReviewId(row.session_id);
  }

  async function fetchComparisonDetail(sessionId: string) {
    setComparisonDetailsBySession((prev) => ({
      ...prev,
      [sessionId]: {
        ...prev[sessionId],
        loading: true,
        error: null,
      },
    }));

    try {
      const response = await fetch(`/api/review/${sessionId}`);
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      const payload = await response.json() as ReviewDataPayload;
      setComparisonDetailsBySession((prev) => ({
        ...prev,
        [sessionId]: {
          ...prev[sessionId],
          data: payload,
          loading: false,
          error: null,
        },
      }));
    } catch (fetchError) {
      setComparisonDetailsBySession((prev) => ({
        ...prev,
        [sessionId]: {
          ...prev[sessionId],
          loading: false,
          error: fetchError instanceof Error ? fetchError.message : 'Failed to load session analysis',
        },
      }));
    }
  }

  function ensureComparisonDetails(sessionIds: string[]) {
    sessionIds.forEach((sessionId) => {
      const existing = comparisonDetailsBySession[sessionId];
      const review = reviews.find((entry) => entry.session_id === sessionId);
      const hasStaleMissingEvaluation = Boolean(
        existing?.data
        && !existing.loading
        && !existing.data.evaluation
        && review?.session_score != null,
      );
      if ((!existing?.data || hasStaleMissingEvaluation) && !existing?.loading) {
        void fetchComparisonDetail(sessionId);
      }
    });
  }

  async function analyzeStagedSessions(promptId: string, sessionIds: string[]) {
    if (sessionIds.length === 0) {
      return;
    }

    setError(null);

    for (const sessionId of sessionIds) {
      setComparisonDetailsBySession((prev) => ({
        ...prev,
        [sessionId]: {
          ...prev[sessionId],
          evaluating: true,
          error: null,
        },
      }));

      try {
        const response = await fetch(`/api/sessions/${sessionId}/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const body = await response.json() as { error?: string };
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }

        await fetchComparisonDetail(sessionId);
      } catch (analysisError) {
        setComparisonDetailsBySession((prev) => ({
          ...prev,
          [sessionId]: {
            ...prev[sessionId],
            evaluating: false,
            error: analysisError instanceof Error ? analysisError.message : 'Failed to analyze session',
          },
        }));
      } finally {
        setComparisonDetailsBySession((prev) => ({
          ...prev,
          [sessionId]: {
            ...prev[sessionId],
            evaluating: false,
          },
        }));
      }
    }

    await Promise.all(sessionIds.map(async (sessionId) => fetchComparisonDetail(sessionId)));
    load();
    setComparisonOpenByPrompt((prev) => ({ ...prev, [promptId]: true }));
  }

  async function archiveReviewSession(review: AdminReviewRow) {
    if (!adminKey) return;
    setMutatingSessionId(review.session_id);
    try {
      await fetchAdminJson<{ session: { archived_at?: number } }>(
        `/api/reviews/${review.session_id}/archive`,
        adminKey,
        { method: 'POST' },
      );
      removeSessionFromLocalState(review.session_id);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Failed to archive review');
    } finally {
      setMutatingSessionId(null);
    }
  }

  async function deleteArchivedReview(review: AdminReviewRow) {
    if (!adminKey) return;
    setMutatingSessionId(review.session_id);
    try {
      await fetchAdminJson<{ deleted: boolean }>(
        `/api/reviews/${review.session_id}`,
        adminKey,
        { method: 'DELETE' },
      );
      removeSessionFromLocalState(review.session_id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete archived review');
    } finally {
      setMutatingSessionId(null);
    }
  }

  function toggleStage(review: AdminReviewRow) {
    setStagedByPrompt((prev) => {
      const current = prev[review.prompt_id] ?? [];
      const next = current.includes(review.session_id)
        ? current.filter((sessionId) => sessionId !== review.session_id)
        : [...current, review.session_id];
      return { ...prev, [review.prompt_id]: next };
    });
    setComparisonOpenByPrompt((prev) => ({ ...prev, [review.prompt_id]: true }));
  }

  const currentReview = useMemo(
    () => reviews.find((review) => review.session_id === reviewId) ?? null,
    [reviewId, reviews],
  );

  useEffect(() => {
    if (!initialSessionId || !reviews.length || reviewId || handledInitialSessionId) return;
    const match = reviews.find((review) => review.session_id === initialSessionId);
    if (!match) return;
    setHandledInitialSessionId(true);
    void openReview(match);
  }, [handledInitialSessionId, initialSessionId, reviews, reviewId]);

  const groups = useMemo<ReviewGroup[]>(() => {
    const grouped = new Map<string, ReviewGroup>();
    for (const review of reviews) {
      const existing = grouped.get(review.prompt_id);
      if (existing) {
        existing.reviews.push(review);
      } else {
        grouped.set(review.prompt_id, {
          prompt_id: review.prompt_id,
          prompt_title: review.prompt_title,
          reviews: [review],
        });
      }
    }

    const statusOrder: Record<SessionReviewStatus, number> = {
      unviewed: 0,
      viewed: 1,
      reviewed: 2,
    };

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        reviews: [...group.reviews].sort((a, b) => (
          statusOrder[a.review_status] - statusOrder[b.review_status]
          || b.completed_at - a.completed_at
        )),
      }))
      .sort((a, b) => {
        const aUnviewed = a.reviews.filter((review) => review.review_status === 'unviewed').length;
        const bUnviewed = b.reviews.filter((review) => review.review_status === 'unviewed').length;
        return bUnviewed - aUnviewed || a.prompt_title.localeCompare(b.prompt_title);
      });
  }, [reviews]);

  if (reviewId) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 px-5 py-2.5">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[12px] transition-colors"
            style={{ color: 'var(--color-text-dim)' }}
            onClick={() => setReviewId(null)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-main)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-dim)'; }}
          >
            <ArrowLeft size={12} />
            Back to reviews
          </button>
          <span style={{ color: 'var(--color-text-dimmest)' }}>·</span>
          <span className="font-mono text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
            {reviewId}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ReviewDashboard
            sessionId={reviewId}
            isDark={isDark}
            onToggleTheme={onToggleTheme}
            reviewStatus={currentReview?.review_status ?? null}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--color-text-bold)' }}>
            Reviews
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={!adminKey || loading}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-medium disabled:opacity-40"
            style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-panel)' }}
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowArchived((value) => !value)}
            className="rounded-xl px-3 py-1.5 text-[12px] font-medium"
            style={{
              color: showArchived ? 'var(--color-text-main)' : 'var(--color-text-muted)',
              background: showArchived ? 'rgba(56,135,206,0.12)' : 'var(--color-bg-panel)',
            }}
          >
            Archived
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl px-3 py-2.5 text-[12px]" style={{ background: 'rgba(239,68,68,0.06)', color: 'var(--color-status-error)' }}>
          {error}
        </div>
      ) : null}

      {!adminKey ? (
        <div className="rounded-xl px-4 py-6 text-center text-[12px]" style={{ background: 'var(--color-bg-panel)', color: 'var(--color-text-dim)' }}>
          Enter your admin key in Settings to view reviews.
        </div>
      ) : groups.length === 0 && !loading ? (
        <div className="rounded-xl px-4 py-8 text-center text-[12px]" style={{ background: 'var(--color-bg-panel)', color: 'var(--color-text-dim)' }}>
          {showArchived ? 'No archived review sessions yet.' : 'No completed review sessions yet.'}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const unviewedRows = group.reviews.filter((review) => review.review_status === 'unviewed');
            const viewedRows = group.reviews.filter((review) => review.review_status === 'viewed');
            const reviewedRows = group.reviews.filter((review) => review.review_status === 'reviewed');
            const stagedIds = stagedByPrompt[group.prompt_id] ?? [];
	            const stagedRows = stagedIds
	              .map((sessionId) => group.reviews.find((review) => review.session_id === sessionId) ?? null)
	              .filter((review): review is AdminReviewRow => review !== null);
	            const stagedCount = stagedRows.length;
	            const anyEvaluating = stagedRows.some((row) => comparisonDetailsBySession[row.session_id]?.evaluating);
                const comparisonGridTemplate = `repeat(${stagedCount}, minmax(360px, 360px))`;
                const llmDimensions = Array.from(new Set(
                  stagedRows.flatMap((review) => (
                    comparisonDetailsBySession[review.session_id]?.data?.evaluation?.result.llm_evaluation.scores.map((item) => item.dimension) ?? []
                  )),
                ));
                const acceptanceCriteria = Array.from(new Set(
                  stagedRows.flatMap((review) => (
                    comparisonDetailsBySession[review.session_id]?.data?.evaluation?.result.llm_evaluation.acceptance_criteria_results?.map((item) => item.criterion) ?? []
                  )),
                ));
                const rubricQuestions = Array.from(new Set(
                  stagedRows.flatMap((review) => (
                    comparisonDetailsBySession[review.session_id]?.data?.evaluation?.result.llm_evaluation.rubric_scores?.map((item) => item.question) ?? []
                  )),
                ));
                const infrastructureKeys = [
                  'caching_effectiveness',
                  'error_handling_coverage',
                  'scaling_awareness',
                ] as const;

	            return (
              <section
                key={group.prompt_id}
                className="overflow-hidden rounded-xl border px-4 py-4"
                style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'transparent' }}
              >
                <div className="border-b pb-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text-bold)' }}>
                        {group.prompt_title}
                      </h3>
                      <div className="mt-1 font-mono text-[10px]" style={{ color: 'var(--color-text-dimmest)' }}>
                        {group.prompt_id}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                        <span>{group.reviews.length} total</span>
                        <span>{unviewedRows.length} unviewed</span>
                        <span>{viewedRows.length} viewed</span>
                        <span>{reviewedRows.length} reviewed</span>
                        {!showArchived && stagedCount > 0 ? <span>{stagedCount} staged</span> : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4 pt-4">
                  {unviewedRows.length > 0 ? (
                    <section>
                      <div className="mb-2 text-[12px] font-semibold" style={{ color: 'var(--color-text-main)' }}>
                        Unviewed ({unviewedRows.length})
                      </div>
                      <div className="space-y-3">
                        {unviewedRows.map((review) => (
                          <ReviewRowCard
                            key={review.session_id}
                            review={review}
                            isStaged={stagedIds.includes(review.session_id)}
                            archivedView={showArchived}
                            mutating={mutatingSessionId === review.session_id}
                            onOpenReview={(row) => { void openReview(row); }}
                            onToggleStage={toggleStage}
                            onArchive={(row) => { void archiveReviewSession(row); }}
                            onDelete={(row) => { void deleteArchivedReview(row); }}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <CollapsibleSection title="Viewed" count={viewedRows.length}>
                    <div className="space-y-3">
                      {viewedRows.map((review) => (
                        <ReviewRowCard
                          key={review.session_id}
                          review={review}
                          isStaged={stagedIds.includes(review.session_id)}
                          archivedView={showArchived}
                          mutating={mutatingSessionId === review.session_id}
                          onOpenReview={(row) => { void openReview(row); }}
                          onToggleStage={toggleStage}
                          onArchive={(row) => { void archiveReviewSession(row); }}
                          onDelete={(row) => { void deleteArchivedReview(row); }}
                        />
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Reviewed" count={reviewedRows.length}>
                    <div className="space-y-3">
                      {reviewedRows.map((review) => (
                        <ReviewRowCard
                          key={review.session_id}
                          review={review}
                          isStaged={stagedIds.includes(review.session_id)}
                          archivedView={showArchived}
                          mutating={mutatingSessionId === review.session_id}
                          onOpenReview={(row) => { void openReview(row); }}
                          onToggleStage={toggleStage}
                          onArchive={(row) => { void archiveReviewSession(row); }}
                          onDelete={(row) => { void deleteArchivedReview(row); }}
                        />
                      ))}
                    </div>
                  </CollapsibleSection>

                  {!showArchived && stagedCount > 0 ? (
                    <CollapsibleSection
                      title="Comparison"
                      count={stagedCount}
                      open={!!comparisonOpenByPrompt[group.prompt_id]}
                      onToggle={(nextOpen) => {
                        setComparisonOpenByPrompt((prev) => ({ ...prev, [group.prompt_id]: nextOpen }));
                        if (nextOpen) {
                          ensureComparisonDetails(stagedIds);
                        }
                      }}
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={anyEvaluating}
                          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-medium disabled:opacity-40"
                          style={{ background: 'rgba(56,135,206,0.1)', color: 'var(--color-brand)' }}
                          onClick={() => { void analyzeStagedSessions(group.prompt_id, stagedIds); }}
                        >
                          {anyEvaluating ? (
                            <Loader size={11} className="animate-spin" />
                          ) : (
                            <FlaskConical size={11} />
                          )}
                          Analyze staged candidates
                        </button>
	                      </div>

	                      <div className="overflow-x-auto">
	                        <div className="flex min-w-max flex-col gap-3">
	                          <div className="grid gap-3" style={{ gridTemplateColumns: comparisonGridTemplate }}>
	                            {stagedRows.map((review) => (
	                              <CompareCandidateHeader
	                                key={review.session_id}
                                review={review}
                                onOpenReview={(row) => { void openReview(row); }}
                                onToggleStage={toggleStage}
                              />
                            ))}
                          </div>

	                          <SharedCompareSection title="Summary" candidateCount={stagedCount}>
	                            <div className="grid gap-3" style={{ gridTemplateColumns: comparisonGridTemplate }}>
	                              {stagedRows.map((review) => (
	                                <ComparisonSummaryCard
	                                  key={`summary-${review.session_id}`}
                                  detail={comparisonDetailsBySession[review.session_id]}
                                />
                              ))}
                            </div>
                          </SharedCompareSection>

	                          <SharedCompareSection title="LLM Scores" candidateCount={stagedCount}>
                                <div className="flex flex-col gap-3">
                                  {llmDimensions.map((dimension) => (
                                    <SynchronizedCriterionRow key={dimension} title={
                                      stagedRows
                                        .map((review) => comparisonDetailsBySession[review.session_id]?.data?.evaluation?.result.llm_evaluation.scores.find((item) => item.dimension === dimension)?.label)
                                        .find(Boolean) ?? dimension
                                    }>
                                      <div className="grid gap-3" style={{ gridTemplateColumns: comparisonGridTemplate }}>
                                        {stagedRows.map((review) => {
                                          const detail = comparisonDetailsBySession[review.session_id];
                                          const item = detail?.data?.evaluation?.result.llm_evaluation.scores.find((score) => score.dimension === dimension);
                                          const color = item ? getTenPointColor(item.score) : 'var(--color-text-dim)';
                                          return (
                                            <ComparisonSectionCard
                                              key={`llm-${dimension}-${review.session_id}`}
                                              loading={detail?.loading}
                                              error={detail?.error}
                                            >
                                              {item ? (
                                                <div>
                                                  <div className="flex items-center justify-between gap-3">
                                                    <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>
                                                      Score
                                                    </span>
                                                    <span className="text-[14px] font-bold tabular-nums" style={{ color }}>
                                                      {item.score.toFixed(1)}<span className="text-[10px] opacity-50">/10</span>
                                                    </span>
                                                  </div>
                                                  <div className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
                                                    {item.rationale}
                                                  </div>
                                                </div>
                                              ) : null}
                                            </ComparisonSectionCard>
                                          );
                                        })}
                                      </div>
                                    </SynchronizedCriterionRow>
                                  ))}
                                </div>
	                          </SharedCompareSection>

	                          <SharedCompareSection title="Acceptance Criteria" candidateCount={stagedCount}>
                                <div className="flex flex-col gap-3">
                                  {acceptanceCriteria.map((criterion) => (
                                    <SynchronizedCriterionRow key={criterion} title={criterion}>
                                      <div className="grid gap-3" style={{ gridTemplateColumns: comparisonGridTemplate }}>
                                        {stagedRows.map((review) => {
                                          const detail = comparisonDetailsBySession[review.session_id];
                                          const item = detail?.data?.evaluation?.result.llm_evaluation.acceptance_criteria_results?.find((entry) => entry.criterion === criterion);
                                          const color = item ? getPercentColor(item.score) : 'var(--color-text-dim)';
                                          return (
                                            <ComparisonSectionCard
                                              key={`acceptance-${criterion}-${review.session_id}`}
                                              loading={detail?.loading}
                                              error={detail?.error}
                                            >
                                              {item ? (
                                                <div>
                                                  <div className="flex items-center gap-3">
                                                    <div className="h-[4px] w-16 shrink-0 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                                      <div className="h-full rounded-full" style={{ width: `${item.score}%`, background: color }} />
                                                    </div>
                                                    <span className="text-[13px] font-bold tabular-nums" style={{ color }}>
                                                      {item.score}<span className="text-[10px] opacity-50">%</span>
                                                    </span>
                                                  </div>
                                                  <div className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
                                                    {item.rationale}
                                                  </div>
                                                </div>
                                              ) : null}
                                            </ComparisonSectionCard>
                                          );
                                        })}
                                      </div>
                                    </SynchronizedCriterionRow>
                                  ))}
                                </div>
	                          </SharedCompareSection>

	                          <SharedCompareSection title="Rubric Questions" candidateCount={stagedCount} defaultOpen={false}>
                                <div className="flex flex-col gap-3">
                                  {rubricQuestions.map((question) => (
                                    <SynchronizedCriterionRow key={question} title={question} defaultOpen={false}>
                                      <div className="grid gap-3" style={{ gridTemplateColumns: comparisonGridTemplate }}>
                                        {stagedRows.map((review) => {
                                          const detail = comparisonDetailsBySession[review.session_id];
                                          const item = detail?.data?.evaluation?.result.llm_evaluation.rubric_scores?.find((entry) => entry.question === question);
                                          const color = item ? getTenPointColor(item.score) : 'var(--color-text-dim)';
                                          return (
                                            <ComparisonSectionCard
                                              key={`rubric-${question}-${review.session_id}`}
                                              loading={detail?.loading}
                                              error={detail?.error}
                                            >
                                              {item ? (
                                                <div>
                                                  <div className="flex items-center justify-between gap-3">
                                                    <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>
                                                      Score
                                                    </span>
                                                    <span className="text-[14px] font-bold tabular-nums" style={{ color }}>
                                                      {item.score.toFixed(1)}<span className="text-[10px] opacity-50">/10</span>
                                                    </span>
                                                  </div>
                                                  <div className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
                                                    {item.rationale}
                                                  </div>
                                                </div>
                                              ) : null}
                                            </ComparisonSectionCard>
                                          );
                                        })}
                                      </div>
                                    </SynchronizedCriterionRow>
                                  ))}
                                </div>
	                          </SharedCompareSection>

	                          <SharedCompareSection title="Infrastructure" candidateCount={stagedCount} defaultOpen={false}>
                                <div className="flex flex-col gap-3">
                                  {infrastructureKeys.map((metricKey) => (
                                    <SynchronizedCriterionRow
                                      key={metricKey}
                                      title={
                                        metricKey === 'caching_effectiveness'
                                          ? 'Caching'
                                          : metricKey === 'error_handling_coverage'
                                            ? 'Errors'
                                            : 'Scaling'
                                      }
                                      defaultOpen={false}
                                    >
                                      <div className="grid gap-3" style={{ gridTemplateColumns: comparisonGridTemplate }}>
                                        {stagedRows.map((review) => {
                                          const detail = comparisonDetailsBySession[review.session_id];
                                          const result = detail?.data?.evaluation?.result;
                                          const item = result?.infrastructure[metricKey];
                                          const pct = item ? Math.round(item.score * 100) : 0;
                                          const color = item ? getScoreColor(item.score) : 'var(--color-text-dim)';
                                          return (
                                            <ComparisonSectionCard
                                              key={`infra-${metricKey}-${review.session_id}`}
                                              loading={detail?.loading}
                                              error={detail?.error}
                                            >
                                              {item ? (
                                                <div>
                                                  <div className="mb-1.5 flex items-center justify-between gap-3">
                                                    <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>
                                                      Score
                                                    </span>
                                                    <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
                                                      {pct}%
                                                    </span>
                                                  </div>
                                                  <div className="h-[4px] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                                                  </div>
                                                  <div className="mt-1.5 text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                                                    {item.details}
                                                  </div>
                                                </div>
                                              ) : null}
                                            </ComparisonSectionCard>
                                          );
                                        })}
                                      </div>
                                    </SynchronizedCriterionRow>
                                  ))}
                                </div>
	                          </SharedCompareSection>

                          <SharedCompareSection title="Iteration Notes" candidateCount={stagedCount} defaultOpen={false}>
                            <div className="flex flex-col gap-3">
                              {Array.from({
                                length: Math.max(
                                  0,
                                  ...stagedRows.map((review) => (
                                    comparisonDetailsBySession[review.session_id]?.data?.evaluation?.result.iterations.length ?? 0
                                  )),
                                ),
                              }).map((_, iterationIndex) => (
                                <SynchronizedCriterionRow
                                  key={`iteration-${iterationIndex}`}
                                  title={`Iteration ${iterationIndex + 1}`}
                                  defaultOpen={false}
                                >
                                  <div className="grid gap-3" style={{ gridTemplateColumns: comparisonGridTemplate }}>
                                    {stagedRows.map((review) => (
                                      <ComparisonIterationRow
                                        key={`iteration-${iterationIndex}-${review.session_id}`}
                                        review={review}
                                        detail={comparisonDetailsBySession[review.session_id]}
                                        iterationIndex={iterationIndex}
                                      />
                                    ))}
                                  </div>
                                </SynchronizedCriterionRow>
                              ))}
                            </div>
                          </SharedCompareSection>
                        </div>
                      </div>
                    </CollapsibleSection>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
