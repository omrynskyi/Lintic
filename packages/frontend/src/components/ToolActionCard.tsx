import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, FileCode, Search, Terminal, FileSearch } from 'lucide-react';

// ─── Local types ─────────────────────────────────────────────────────────────

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
  description?: string | null;
  tool_calls: LocalToolCall[];
  tool_results: LocalToolResult[];
}

const OUTPUT_MAX_CHARS = 1000;

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= OUTPUT_MAX_CHARS) return { text, truncated: false };
  return { text: text.slice(0, OUTPUT_MAX_CHARS), truncated: true };
}

function DiffPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div data-testid="tool-action-diff" className="max-w-full overflow-x-auto">
      <div className="min-w-fit font-mono text-[12px] leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre text-[var(--color-status-diff-add)] opacity-90">
            {'+ '}{line}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommandOutput({ output }: { output: string }) {
  const { text, truncated } = truncate(output);
  return (
    <pre
      data-testid="tool-action-result"
      className="max-w-full overflow-x-auto font-mono text-[12px] text-[var(--color-text-main)] opacity-80 whitespace-pre"
    >
      {text}
      {truncated && <span className="opacity-40">{'\n'}…(truncated)</span>}
    </pre>
  );
}

function SingleToolCard({ call, result }: { call: LocalToolCall; result: LocalToolResult | undefined }) {
  const [open, setOpen] = useState(false);
  const isError = result?.is_error ?? false;

  let mainParam = '';
  if (call.name === 'write_file' || call.name === 'read_file' || call.name === 'edit_file' || call.name === 'insert_in_file') {
    mainParam = (call.input['path'] as string) || '';
  } else if (call.name === 'run_command' || call.name === 'run_shell_command' || call.name === 'run_command_background') {
    mainParam = (call.input['command'] as string) || '';
  } else if (call.name === 'search_files' || call.name === 'grep_search') {
    mainParam = (call.input['pattern'] as string) || '';
  } else if (call.name === 'list_directory') {
    mainParam = (call.input['dir_path'] as string) || '';
  }

  const displayName = call.name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const getIcon = () => {
    if (call.name.includes('file')) return <FileCode size={13} />;
    if (call.name.includes('search')) return <Search size={13} />;
    if (call.name.includes('command') || call.name.includes('shell')) return <Terminal size={13} />;
    return <FileSearch size={13} />;
  };

  return (
    <div data-testid="tool-action-card" className="flex flex-col mb-1 last:mb-0">
      <button
        type="button"
        data-testid="tool-action-toggle"
        onClick={() => setOpen((v) => !v)}
        className="group w-full flex items-center justify-between rounded-[var(--assessment-radius-control)] px-2 py-1 transition-colors hover:bg-[var(--color-surface-subtle)]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex items-center shrink-0 transition-colors text-[var(--color-text-dim)] group-hover:text-[var(--color-text-main)]">
            {getIcon()}
          </span>
          <div className="flex items-center gap-2 truncate">
            <span className="text-[12px] font-bold tracking-tight shrink-0 transition-colors text-[var(--color-text-main)] group-hover:text-[var(--color-text-bold)]">
              {displayName}:
            </span>
            {mainParam && (
              <span className="text-[12px] truncate font-medium tracking-tight text-[var(--color-text-dim)] group-hover:text-[var(--color-text-main)]">
                {mainParam}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {isError && (
            <span
              data-testid="tool-action-error-badge"
              className="text-[10px] text-[var(--color-status-error)] font-bold tracking-tight uppercase"
            >
              Error
            </span>
          )}
          <ChevronDown 
            size={13} 
            className={`transition-transform duration-300 text-[var(--color-text-dimmest)] group-hover:text-[var(--color-text-dim)] ${open ? 'rotate-180' : ''}`} 
          />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div
              data-testid="tool-action-body"
              className="mt-1 rounded-[var(--assessment-radius-control)] px-4 py-3 space-y-3"
              style={{ background: 'var(--color-surface-subtle)' }}
            >
              {/* Detailed Input */}
              <div className="space-y-2">
                {Object.entries(call.input).map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <span className="px-0.5 text-[9px] font-bold tracking-widest uppercase text-[var(--color-text-dimmest)]">
                      {k}
                    </span>
                    <div className="max-w-full overflow-x-auto px-1 font-mono text-[11px] leading-relaxed whitespace-pre text-[var(--color-text-muted)]">
                      {typeof v === 'string' ? v : JSON.stringify(v, null, 2)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Result Output */}
              {result !== undefined && (
                <div className="pt-3" style={{ borderTop: '1px solid var(--color-border-main)' }}>
                  <span className="block mb-1.5 px-0.5 text-[9px] font-bold tracking-widest uppercase text-[var(--color-text-dimmest)]">
                    Output
                  </span>
                  <div className="px-1">
                    {(call.name === 'write_file' || call.name === 'edit_file' || call.name === 'insert_in_file' || call.name === 'replace') && !isError ? (
                      <DiffPreview content={(result.output === 'ok' || result.output.startsWith('Successfully'))
                        ? ((call.input['content'] as string) || (call.input['new_text'] as string) || (call.input['new_string'] as string) || '')
                        : result.output}
                      />
                    ) : (
                      <CommandOutput output={result.output} />
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ToolActionCard({ action }: { action: LocalToolAction | LocalToolAction[] }) {
  const [showAll, setShowAll] = useState(false);
  const actions = Array.isArray(action) ? action : [action];
  
  // Flatten all tool calls across all actions
  const allCalls = actions.flatMap((a, actionIndex) => a.tool_calls.map((call, callIndex) => ({
    actionIndex,
    callIndex,
    description: a.description,
    call,
    result: a.tool_results.find(r => r.tool_call_id === call.id)
  })));

  const limit = 3;
  const hasMore = allCalls.length > limit;
  const visibleCalls = showAll ? allCalls : allCalls.slice(0, limit);

  return (
    <div className="w-full flex flex-col">
      {visibleCalls.map(({ actionIndex, callIndex, description, call, result }) => (
        <div key={call.id} className="flex flex-col">
          {callIndex === 0 && description && (
            <div
              data-testid="tool-action-description"
              className="mb-1 px-5 text-[12px] leading-relaxed"
              style={{ color: 'var(--color-text-dim)' }}
            >
              {description}
            </div>
          )}
          <SingleToolCard call={call} result={result} />
          {showAll && actionIndex < actions.length - 1 && callIndex === actions[actionIndex]!.tool_calls.length - 1 ? (
            <div className="h-2" />
          ) : null}
        </div>
      ))}
      
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="group w-full flex items-center py-1 transition-colors"
        >
          <span className="pl-5 text-[12px] text-[var(--color-text-dim)] group-hover:text-[var(--color-text-main)]">
            {showAll ? '— show less' : `+ ${allCalls.length - limit} more tool uses`}
          </span>
        </button>
      )}
    </div>
  );
}
