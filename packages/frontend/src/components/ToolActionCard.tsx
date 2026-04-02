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
    <div data-testid="tool-action-diff" className="font-mono text-[12px] leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className="text-[var(--color-status-diff-add)] opacity-90">
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
      className="font-mono text-[12px] text-[var(--color-text-main)] opacity-80 whitespace-pre-wrap break-all"
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

  const getIcon = () => {
    if (call.name.includes('file')) return <FileCode size={14} />;
    if (call.name.includes('search')) return <Search size={14} />;
    if (call.name.includes('command')) return <Terminal size={14} />;
    return <FileSearch size={14} />;
  };

  return (
    <div data-testid="tool-action-card" className="mb-4 last:mb-0 flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-6 py-3 transition-all duration-200 border border-white/5 z-10 ${
          open 
            ? 'bg-[#1A1A1A] rounded-t-[var(--radius-md)] rounded-b-none' 
            : 'bg-[#141414] hover:bg-[#1A1A1A] rounded-[var(--radius-md)]'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white/40 flex items-center shrink-0">
            {getIcon()}
          </span>
          <div className="flex items-center gap-2 truncate">
            <span className="text-[13px] font-bold text-white tracking-tight shrink-0">
              {displayName}:
            </span>
            {mainParam && (
              <span className="text-[13px] text-white/50 truncate font-medium tracking-tight">
                {mainParam}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          {isError && (
            <span className="text-[11px] text-[var(--color-status-error)] font-bold tracking-tight">
              Error
            </span>
          )}
          <ChevronDown 
            size={16} 
            className={`transition-transform duration-300 text-white/20 ${open ? 'rotate-180' : ''}`} 
          />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div
              data-testid="tool-action-body"
              className="p-6 pt-8 rounded-b-[var(--radius-md)] bg-[#0F0F0F] border-x border-b border-white/5 space-y-6"
            >
              {/* Detailed Input */}
              <div className="space-y-4">
                {Object.entries(call.input).map(([k, v]) => (
                  <div key={k} className="space-y-2">
                    <span className="text-[11px] font-bold tracking-tight text-white/20 px-1 uppercase letter-spacing-widest">
                      {k}
                    </span>
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 font-mono text-[12px] break-all text-white/70 leading-relaxed overflow-hidden">
                      {typeof v === 'string' ? v : JSON.stringify(v, null, 2)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Result Output */}
              {result !== undefined && (
                <div className="pt-6 border-t border-white/5">
                  <span className="text-[11px] font-bold tracking-tight text-white/20 block mb-3 px-1 uppercase letter-spacing-widest">
                    Output
                  </span>
                  <div className="px-1">
                    {call.name === 'write_file' && !isError ? (
                      <DiffPreview content={result.output === 'ok' ? (call.input['content'] as string | undefined) ?? '' : result.output} />
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

export function ToolActionCard({ action }: { action: LocalToolAction }) {
  return (
    <div className="w-full">
      {action.tool_calls.map((call) => {
        const result = action.tool_results.find((r) => r.tool_call_id === call.id);
        return <SingleToolCard key={call.id} call={call} result={result} />;
      })}
    </div>
  );
}
