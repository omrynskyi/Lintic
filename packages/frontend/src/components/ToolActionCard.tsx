import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// ─── Local types (mirror @lintic/core shapes used in AgentLoopResult) ─────────

export interface LocalToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LocalToolResult {
  tool_call_id: string;
  name: string;
  output: string;
  is_error: boolean;
}

export interface LocalToolAction {
  tool_calls: LocalToolCall[];
  tool_results: LocalToolResult[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OUTPUT_MAX_CHARS = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= OUTPUT_MAX_CHARS) return { text, truncated: false };
  return { text: text.slice(0, OUTPUT_MAX_CHARS), truncated: true };
}

// ─── Sub-renderers ────────────────────────────────────────────────────────────

function DiffPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div data-testid="tool-action-diff" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
      {lines.map((line, i) => (
        <div key={i} style={{ color: 'var(--color-status-diff-add)', whiteSpace: 'pre' }}>
          {'+ '}{line}
        </div>
      ))}
    </div>
  );
}

function CommandOutput({ output }: { output: string }) {
  const { text, truncated } = truncate(output);
  return (
    <pre
      data-testid="tool-action-result"
      style={{
        fontFamily: 'monospace',
        fontSize: '11px',
        color: 'var(--color-text-tool-output)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        margin: 0,
      }}
    >
      {text}
      {truncated && <span style={{ color: 'var(--color-text-dim)' }}>{'\n'}…(truncated)</span>}
    </pre>
  );
}

function DefaultOutput({ output, isError }: { output: string; isError: boolean }) {
  const { text, truncated } = truncate(output);
  return (
    <div
      data-testid="tool-action-result"
      style={{
        fontFamily: 'monospace',
        fontSize: '11px',
        color: isError ? 'var(--color-status-error-text)' : 'var(--color-text-muted)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      {text}
      {truncated && <span style={{ color: 'var(--color-text-dim)' }}> …(truncated)</span>}
    </div>
  );
}

// ─── Single tool call card ────────────────────────────────────────────────────

function SingleToolCard({ call, result }: { call: LocalToolCall; result: LocalToolResult | undefined }) {
  const [open, setOpen] = useState(false);
  const isError = result?.is_error ?? false;

  // Determine the primary parameter to show in the header (e.g., path for write_file)
  let mainParam = '';
  if (call.name === 'write_file' || call.name === 'read_file') {
    mainParam = (call.input['path'] as string) || '';
  } else if (call.name === 'run_command') {
    mainParam = (call.input['command'] as string) || '';
  } else if (call.name === 'search_files') {
    mainParam = (call.input['pattern'] as string) || '';
  }

  const displayName = call.name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <div
      data-testid="tool-action-card"
      className="mb-4"
    >
      {/* Header — toggle */}
      <button
        data-testid="tool-action-toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
        style={{
          color: isError ? 'var(--color-status-error-text)' : 'var(--color-text-main)',
        }}
        aria-expanded={open}
      >
        <span className="font-bold">{displayName}:</span>
        {mainParam && (
          <span className="opacity-40 overflow-hidden text-ellipsis whitespace-nowrap font-normal">
            {mainParam}
          </span>
        )}
        <ChevronDown 
          size={12} 
          className={`transition-transform duration-200 opacity-40 ${open ? 'rotate-180' : ''}`} 
        />
        {isError && (
          <span
            data-testid="tool-action-error-badge"
            className="ml-2 text-[10px] text-red-500 font-bold"
          >
            (Error)
          </span>
        )}
      </button>

      {/* Body — expandable */}
      {open && (
        <div
          data-testid="tool-action-body"
          className="mt-2 p-6 rounded-[25px] bg-opacity-80"
          style={{ 
            background: 'var(--color-bg-tool-body)', 
          }}
        >
          {/* Parameters table for other params */}
          {Object.keys(call.input).length > 0 && (
            <div className="mb-4 space-y-2">
              {Object.entries(call.input).map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1 text-[11px] font-mono">
                  <span className="opacity-50 font-bold uppercase text-[9px] tracking-wider">{k}:</span>
                  <div className="opacity-90 break-all p-2 rounded-lg bg-black/5 dark:bg-white/5">
                    {typeof v === 'string' ? v : JSON.stringify(v)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Result */}
          {result !== undefined && (
            <div className="mt-4 pt-4">
              {call.name === 'write_file' && !isError ? (
                <DiffPreview content={result.output === 'ok' ? (call.input['content'] as string | undefined) ?? '' : result.output} />
              ) : call.name === 'run_command' || call.name === 'search_files' ? (
                <CommandOutput output={result.output} />
              ) : (
                <DefaultOutput output={result.output} isError={isError} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function ToolActionCard({ action }: { action: LocalToolAction }) {
  return (
    <div>
      {action.tool_calls.map((call) => {
        const result = action.tool_results.find((r) => r.tool_call_id === call.id);
        return <SingleToolCard key={call.id} call={call} result={result} />;
      })}
    </div>
  );
}
