import { useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';

interface TopBarProps {
  secondsRemaining: number;
  tokensRemaining: number;
  interactionsRemaining: number;
  maxTokens: number;
  contextWindow?: number;
  maxInteractions: number;
  isDark: boolean;
  onViewPrompt?: () => void;
  onSubmitTask?: () => void;
  submitDisabled?: boolean;
  submittingTask?: boolean;
  showAutoSubmitWarning?: boolean;
  taskName?: string;
  deliverables?: string;
  compact?: boolean;
  narrow?: boolean;
}

function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')} min`;
}

function formatCompactTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TopBar({
  secondsRemaining,
  tokensRemaining,
  maxTokens,
  isDark,
  onViewPrompt,
  onSubmitTask,
  submitDisabled = false,
  submittingTask = false,
  showAutoSubmitWarning = false,
  taskName = 'Library Backend Service',
  deliverables = 'PRD + Implementation',
  compact = false,
  narrow = false,
}: TopBarProps) {
  const metadataCardRef = useRef<HTMLDivElement>(null);
  const [metadataCardWidth, setMetadataCardWidth] = useState<number>(0);
  const safeMaxTokens = Math.max(1, maxTokens);
  const safeTokensRemaining = Math.max(0, Math.min(tokensRemaining, safeMaxTokens));
  const tokensLeftPct = (safeTokensRemaining / safeMaxTokens) * 100;
  const tokenRingRadius = compact ? 11 : 12;
  const tokenRingCircumference = 2 * Math.PI * tokenRingRadius;
  const tokenRingOffset = tokenRingCircumference * (1 - tokensLeftPct / 100);
  const stackMetadata = !narrow && compact && metadataCardWidth > 0 && metadataCardWidth < 430;
  const useShortPromptLabel = compact && metadataCardWidth > 0 && metadataCardWidth < 520;
  const isTimeCritical = secondsRemaining > 0 && secondsRemaining <= 180;
  const isTimeWarning = secondsRemaining > 180 && secondsRemaining <= 600;
  const timeColor = isTimeCritical
    ? '#f87171'
    : isTimeWarning
      ? '#fbbf24'
      : 'var(--color-text-bold)';

  useEffect(() => {
    const node = metadataCardRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setMetadataCardWidth(entry.contentRect.width);
    });

    observer.observe(node);
    setMetadataCardWidth(node.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  return (
    <header className="shrink-0 px-2">
      <div
        className={
          narrow
            ? 'flex min-w-0 items-start gap-3 py-2'
            : compact
              ? 'flex min-w-0 items-center gap-3 py-2'
            : 'flex min-w-0 items-center gap-4 py-3'
        }
      >
        {/* Logo and Branding */}
        <div className={`flex shrink-0 items-center gap-3 ${compact ? 'pl-1 pr-1' : 'pl-2 pr-2'}`}>
          <img 
            src={isDark ? "/logo-dark.png" : "/logo-light.png"} 
            alt="Lintic" 
            className="w-8 h-8 object-contain"
          />
          <span className="font-bold text-xl tracking-tight" style={{ color: 'var(--color-text-bold)' }}>Lintic</span>
        </div>

        <div
          ref={metadataCardRef}
          className={
            narrow
              ? 'flex min-w-0 shrink-0 items-center gap-3 rounded-[var(--assessment-radius-shell)] px-3 py-2'
              : compact
              ? 'flex min-w-0 flex-1 items-center gap-3 rounded-[var(--assessment-radius-shell)] px-3 py-2'
              : 'flex min-w-0 flex-1 items-center gap-3 rounded-[var(--assessment-radius-shell)] px-4 py-2'
          }
          style={{
            background: 'var(--color-bg-panel)',
            border: '1px solid var(--color-border-main)',
            boxShadow: 'var(--assessment-shadow-soft)',
          }}
        >
          {!narrow ? (
            <div
              className={
                compact
                  ? `flex min-w-0 flex-1 ${stackMetadata ? 'flex-col items-start gap-y-1.5' : 'items-center gap-x-5'}`
                  : 'flex min-w-0 flex-1 items-center gap-x-6'
              }
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-dim)' }}>Task:</span>
                <span className="min-w-0 truncate text-[13px] font-bold" style={{ color: 'var(--color-text-bold)' }}>{taskName}</span>
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-dim)' }}>Deliverables:</span>
                <span className="min-w-0 truncate text-[13px] font-bold" style={{ color: 'var(--color-text-bold)' }}>{deliverables}</span>
              </div>
            </div>
          ) : null}

          {onViewPrompt ? (
            <button
              type="button"
              data-1p-ignore
              data-testid="view-prompt"
              onClick={onViewPrompt}
              className={`flex shrink-0 items-center gap-2 rounded-[var(--assessment-radius-control)] text-[13px] font-bold tracking-tight transition-all hover:brightness-105 ${
                narrow ? 'px-3 py-1.5' : compact ? 'px-3 py-1.5' : 'px-4 py-2.5 min-[1600px]:px-5'
              }`}
              style={{
                background: 'var(--color-bg-tab)',
                border: '1px solid var(--color-border-main)',
                color: 'var(--color-brand)',
                boxShadow: 'var(--assessment-shadow-panel)',
              }}
            >
              {narrow || useShortPromptLabel ? 'Prompt' : 'View full prompt'}
            </button>
          ) : null}

        </div>

        {/* Time & Submit */}
        <div
          className={`flex shrink-0 ${narrow ? 'items-center gap-2 pl-1 pr-1' : compact ? 'items-center gap-2 pl-1 pr-1' : 'items-center gap-3 pr-2'}`}
        >
          <div className="flex shrink-0 items-center gap-2" data-testid="status-stack">
            <div
              className="flex items-center gap-2 rounded-full px-2 py-1"
              data-testid="tokens-left"
              aria-label={`Context remaining: ${safeTokensRemaining.toLocaleString()}`}
              title={`Context remaining: ${safeTokensRemaining.toLocaleString()}`}
              style={{ background: 'color-mix(in srgb, var(--color-bg-panel) 72%, transparent)' }}
            >
              <div className="relative shrink-0" data-testid="tokens-left-wheel">
                <svg width={compact ? 26 : 28} height={compact ? 26 : 28} viewBox="0 0 28 28" aria-hidden="true">
                  <circle
                    cx="14"
                    cy="14"
                    r={tokenRingRadius}
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="14"
                    cy="14"
                    r={tokenRingRadius}
                    fill="none"
                    stroke="var(--color-brand)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={tokenRingCircumference}
                    strokeDashoffset={tokenRingOffset}
                    transform="rotate(-90 14 14)"
                    style={{ transition: 'stroke-dashoffset 220ms ease' }}
                  />
                </svg>
              </div>
              <span className="text-[12px] font-bold tabular-nums" style={{ color: 'var(--color-text-bold)' }}>
                {safeTokensRemaining.toLocaleString()}
              </span>
            </div>
            <div
              className="flex items-center gap-1.5 rounded-full px-2 py-1"
              aria-label={`Time remaining: ${formatTime(secondsRemaining)}`}
              title={`Time remaining: ${formatTime(secondsRemaining)}`}
              style={{ background: 'color-mix(in srgb, var(--color-bg-panel) 72%, transparent)' }}
            >
              <Clock3 size={compact ? 13 : 14} style={{ color: timeColor }} />
              <span
                data-testid="timer"
                className="text-[12px] font-bold tabular-nums transition-colors"
                style={{ color: timeColor }}
              >
                {formatCompactTime(secondsRemaining)}
              </span>
            </div>
          </div>
          <button
            type="button"
            data-testid="submit-task"
            onClick={onSubmitTask}
            disabled={submitDisabled || !onSubmitTask}
            className={`flex items-center gap-2 rounded-[var(--assessment-radius-control)] text-[13px] font-bold tracking-tight transition-all hover:brightness-105 ${
              narrow ? 'px-4 py-2' : compact ? 'px-4 py-2' : 'px-5 py-2.5'
            }`}
            style={{
              background: 'var(--color-brand-green-dark)',
              border: '1px solid rgba(16, 185, 129, 0.12)',
              color: 'var(--color-brand-green)',
              boxShadow: 'var(--assessment-shadow-panel)',
              opacity: submitDisabled || !onSubmitTask ? 0.5 : 1,
              cursor: submitDisabled || !onSubmitTask ? 'not-allowed' : 'pointer',
            }}
          >
            {submittingTask ? 'Submitting...' : 'Submit task'}
          </button>
        </div>
      </div>
    </header>
  );
}
