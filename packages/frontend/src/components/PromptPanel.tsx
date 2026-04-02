import type { PromptSummary } from '@lintic/core';

interface PromptPanelProps {
  prompt: PromptSummary;
  onDismiss: () => void;
}

export function PromptPanel({ prompt, onDismiss }: PromptPanelProps) {
  return (
    <section
      className="shrink-0 border-b px-4 py-3"
      style={{
        borderColor: 'var(--color-border-main)',
        background: 'var(--color-bg-panel)',
      }}
      data-testid="prompt-panel"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Assessment Prompt
          </p>
          <h2
            className="mt-1 text-sm font-semibold"
            style={{ color: 'var(--color-text-bold)' }}
            data-testid="prompt-title"
          >
            {prompt.title}
          </h2>
          {prompt.description ? (
            <p
              className="mt-1 max-w-4xl text-sm leading-6 whitespace-pre-wrap"
              style={{ color: 'var(--color-text-main)' }}
              data-testid="prompt-description"
            >
              {prompt.description}
            </p>
          ) : null}
          {prompt.tags && prompt.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2" data-testid="prompt-tags">
              {prompt.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{
                    borderColor: 'var(--color-border-main)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{
            borderColor: 'var(--color-border-main)',
            color: 'var(--color-text-main)',
          }}
          data-testid="dismiss-prompt"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
