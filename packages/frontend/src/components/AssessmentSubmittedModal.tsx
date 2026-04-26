import type { SessionSummaryStats } from '../lib/session-persist.js';

interface AssessmentSubmittedModalProps {
  mode: 'confirm' | 'submitted' | 'expired';
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

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 last:border-0" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
      <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-dim)' }}>{label}</span>
      <span className="text-[14px] font-semibold" style={{ color: 'var(--color-text-main)' }}>{value}</span>
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
  const isExpired = mode === 'expired';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6 py-8"
      style={{
        background: 'rgba(9, 9, 11, 0.60)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-[28px] border shadow-2xl transition-all"
        style={{
          background: 'var(--color-bg-panel)',
          borderColor: 'var(--color-border-main)',
          boxShadow: 'var(--assessment-shadow-soft)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-modal-title"
      >
        <div className="px-8 pt-9 pb-6">
          <div className="mb-8 text-center">
            <h2
              id="assessment-modal-title"
              className="text-[26px] font-bold tracking-tight"
              style={{ color: 'var(--color-text-bold)' }}
            >
              {isConfirm ? 'Ready to wrap up?' : isExpired ? 'Time ran out' : 'High five! 🙌'}
            </h2>

            <p className="mt-3 px-2 text-[14px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {isConfirm
                ? `We’ll save your progress${promptTitle ? ` for ${promptTitle}` : ''} and lock it in. No more edits after this!`
                : isExpired
                  ? 'The assessment timer ended, so your work was automatically submitted.'
                  : `Your assessment is safely tucked away. You did a great job today.`}
            </p>
          </div>

          {!isConfirm && stats && (
            <div className="mb-8 rounded-2xl px-5 py-2" style={{ background: 'var(--color-surface-subtle)' }}>
              <StatRow label={isExpired ? 'Submitted automatically' : 'Submitted'} value={formatTimestamp(stats.submittedAt)} />
              <StatRow label="Time spent" value={formatDuration(stats.timeSpentSeconds)} />
              <StatRow label="Turns used" value={`${stats.interactionsUsed} / ${stats.maxInteractions}`} />
              <StatRow label="Tokens used" value={`${stats.tokensUsed} / ${stats.maxTokens}`} />
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {isConfirm ? (
              <>
                <button
                  type="button"
                  data-testid="assessment-confirm-submit"
                  onClick={onConfirm}
                  disabled={submitting}
                  className="w-full rounded-2xl px-4 py-3.5 text-[15px] font-bold text-white transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'var(--color-brand-green)' }}
                >
                  {submitting ? 'Submitting...' : 'Yes, I\'m done!'}
                </button>
                <button
                  type="button"
                  data-testid="assessment-confirm-cancel"
                  onClick={onCancel}
                  disabled={submitting}
                  className="w-full rounded-2xl px-4 py-2 text-[14px] font-medium transition-all"
                  style={{ color: 'var(--color-text-dim)' }}
                >
                  Wait, let me check one thing
                </button>
              </>
            ) : (
              <div className="text-center py-4 px-2">
                <p className="text-[15px] font-medium" style={{ color: 'var(--color-text-main)' }}>
                  Please wait for the company to reach out to you.
                </p>
                <p className="mt-1 text-[13px]" style={{ color: 'var(--color-text-dim)' }}>
                  You can now safely close this window.
                </p>
              </div>
            )}
          </div>

          <div className="mt-10 flex flex-col items-center gap-3 opacity-40">
            <img src="/logo-dark.png" alt="Lintic" className="h-4 w-auto grayscale brightness-200 dark:brightness-200" />
            <span className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--color-text-dim)' }}>
              Powered by Lintic
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
