import type { SessionSummaryStats } from '../lib/session-persist.js';

interface AssessmentSubmittedModalProps {
  mode: 'confirm' | 'submitted';
  promptTitle?: string | null;
  stats?: SessionSummaryStats | null;
  submitting?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
  onDone?: () => void;
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return 'Just now';
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(1, minutes)}m`;
}

function Surface({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div
      className="rounded-[22px] border px-5 py-4"
      style={{
        background: 'rgba(255,255,255,0.045)',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--color-text-dim)' }}>
        {title}
      </div>
      <div className="mt-3 text-[26px] font-semibold leading-none" style={{ color: 'var(--color-text-bold)' }}>
        {value}
      </div>
      {detail ? (
        <div className="mt-2 text-[12px] leading-5" style={{ color: 'var(--color-text-muted)' }}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export function AssessmentSubmittedModal({
  mode,
  promptTitle,
  stats,
  submitting = false,
  onCancel,
  onConfirm,
  onDone,
}: AssessmentSubmittedModalProps) {
  const isConfirm = mode === 'confirm';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6 py-8"
      style={{
        background: 'rgba(8, 10, 14, 0.3)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-[34px] border shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(20,22,28,0.94) 0%, rgba(12,14,18,0.96) 100%)',
          borderColor: 'rgba(255,255,255,0.08)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-modal-title"
      >
        <div
          className="px-8 py-8 sm:px-10"
          style={{
            background:
              'radial-gradient(circle at top left, rgba(255,255,255,0.06), transparent 42%)',
          }}
        >
          <div
            className="inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{
              borderColor: isConfirm ? 'rgba(245,158,11,0.24)' : 'rgba(16,185,129,0.24)',
              background: isConfirm ? 'rgba(245,158,11,0.09)' : 'rgba(16,185,129,0.09)',
              color: isConfirm ? '#fbbf24' : '#34d399',
            }}
          >
            {isConfirm ? 'Ready To Submit' : 'Assessment Submitted'}
          </div>

          <div className="mt-5 max-w-2xl">
            <h2
              id="assessment-modal-title"
              className="text-[32px] font-semibold tracking-tight sm:text-[38px]"
              style={{ color: '#f8fafc' }}
            >
              {isConfirm ? 'Are you sure you want to submit?' : 'You did it. Your assessment is complete.'}
            </h2>

            <p className="mt-4 text-[15px] leading-7" style={{ color: 'rgba(226,232,240,0.82)' }}>
              {isConfirm
                ? `We’re ready to lock in your work${promptTitle ? ` for ${promptTitle}` : ''}. Once you submit, this attempt will be saved and the editor will stay closed if you open the link again.`
                : `${promptTitle ? `${promptTitle} has been submitted successfully. ` : 'Your submission is safely recorded. '}Nice work getting through it. This is a good moment to stretch, grab some water, and take a proper breather.`}
            </p>
          </div>

          {isConfirm ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Surface
                title="What Happens Next"
                value="Submission is final"
                detail="We save this attempt and replace the editor with your submitted summary."
              />
              <Surface
                title="Before You Confirm"
                value="Take one last look"
                detail="Double-check your solution now if you still want to make any edits."
              />
            </div>
          ) : stats ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Surface
                title="Submitted"
                value={formatTimestamp(stats.submittedAt)}
                detail="Final confirmation time"
              />
              <Surface
                title="Time Spent"
                value={formatDuration(stats.timeSpentSeconds)}
                detail="Focused work time"
              />
              <Surface
                title="Turns Used"
                value={`${stats.interactionsUsed}/${stats.maxInteractions}`}
                detail="Messages sent during the session"
              />
              <Surface
                title="Tokens Used"
                value={`${stats.tokensUsed}/${stats.maxTokens}`}
                detail="Total model budget consumed"
              />
            </div>
          ) : null}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {isConfirm ? (
              <>
                <button
                  type="button"
                  data-testid="assessment-confirm-cancel"
                  onClick={onCancel}
                  disabled={submitting}
                  className="rounded-[18px] border px-5 py-3 text-[13px] font-semibold transition-all"
                  style={{
                    borderColor: 'rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(226,232,240,0.88)',
                    opacity: submitting ? 0.6 : 1,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Keep working
                </button>
                <button
                  type="button"
                  data-testid="assessment-confirm-submit"
                  onClick={onConfirm}
                  disabled={submitting}
                  className="rounded-[18px] px-5 py-3 text-[13px] font-semibold transition-all hover:brightness-110"
                  style={{
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: '#f8fafc',
                    opacity: submitting ? 0.85 : 1,
                    cursor: submitting ? 'progress' : 'pointer',
                  }}
                >
                  {submitting ? 'Submitting your assessment...' : 'Submit assessment'}
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="assessment-submitted-done"
                onClick={onDone}
                className="rounded-[18px] px-5 py-3 text-[13px] font-semibold transition-all hover:brightness-110"
                style={{
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  color: '#f8fafc',
                }}
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
