import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Globe, Maximize2, Minimize2, Play, RefreshCw, Route, X } from 'lucide-react';
import { useWebContainer } from '../hooks/useWebContainer.js';
import {
  formatResponseBody,
  runCurlRequest,
  type CurlMethod,
  type CurlRequestInput,
  type CurlResponse,
} from '../lib/curl-request.js';

const DEFAULT_URL = 'http://localhost:3000/';
const METHODS: CurlMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function prettyHeaderName(name: string): string {
  return name
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join('-');
}

function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneStyles: Record<'neutral' | 'success' | 'warning' | 'danger', string> = {
    neutral: 'border-[var(--db-border-default)] bg-[var(--db-surface-subtle)] text-[var(--db-text-secondary)]',
    success: 'border-[rgba(16,185,129,0.18)] bg-[rgba(16,185,129,0.12)] text-[var(--color-brand-green)]',
    warning: 'border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.12)] text-[var(--color-status-warning)]',
    danger: 'border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.12)] text-[var(--db-danger-text)]',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneStyles[tone]}`}>
      {children}
    </span>
  );
}

function PanelCard({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`db-surface overflow-hidden ${className}`}>
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--db-border-default)' }}>
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--db-text-primary)' }}>
          {icon}
          {title}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function parseStatusLabel(response: CurlResponse | null): string {
  if (!response) return '';
  const statusCode = response.statusCode ?? '---';
  const statusText = response.statusText ?? 'Unknown';
  return `${statusCode} ${statusText}`;
}

export function CurlPanel() {
  const { wc, ready, error } = useWebContainer();
  const [method, setMethod] = useState<CurlMethod>('GET');
  const [url, setUrl] = useState(DEFAULT_URL);
  const [headersText, setHeadersText] = useState('');
  const [body, setBody] = useState('');
  const [followRedirects, setFollowRedirects] = useState(true);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [response, setResponse] = useState<CurlResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerExpanded, setDrawerExpanded] = useState(true);
  const [displayMode, setDisplayMode] = useState<'formatted' | 'raw'>('formatted');

  const formattedBody = useMemo(() => {
    if (!response) {
      return { bodyText: '', isJson: false };
    }
    return formatResponseBody(response.responseBody, response.contentType);
  }, [response]);

  async function handleRunRequest() {
    if (!wc) {
      setRunError('WebContainer is still booting.');
      return;
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setRunError('Enter a server URL before sending the request.');
      return;
    }

    const nextRequest: CurlRequestInput = {
      method,
      url: trimmedUrl,
      headersText,
      body,
      followRedirects,
    };

    setRunning(true);
    setRunError(null);
    try {
      const nextResponse = await runCurlRequest(wc, nextRequest);
      setResponse(nextResponse);
      setDrawerOpen(true);
      setDrawerExpanded(true);
      setDisplayMode('formatted');
    } catch (err) {
      setResponse(null);
      setDrawerOpen(false);
      setRunError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setRunning(false);
    }
  }

  function handleUseLocalhost() {
    setUrl(DEFAULT_URL);
  }

  const statusTone: 'neutral' | 'success' | 'warning' | 'danger' = response
    ? response.statusCode === null
      ? 'warning'
      : response.statusCode >= 400
        ? 'danger'
        : 'success'
    : 'neutral';

  const drawerHeightClass = drawerExpanded ? 'h-[min(62vh,42rem)]' : 'h-[16rem]';

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--color-bg-code)' }}>
      <div className="border-b px-5 pt-4" style={{ borderColor: 'var(--color-border-main)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-text-bold)' }}>
              <Globe size={18} />
              Curl
            </div>
            <div className="mt-1 text-sm" style={{ color: 'var(--color-text-dim)' }}>
              Query a running server and inspect the response.
            </div>
          </div>

          {response ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone}>{parseStatusLabel(response)}</Badge>
              {response?.contentType ? <Badge tone="neutral">{response.contentType}</Badge> : null}
              <Badge tone="neutral">{`${response.durationMs} ms`}</Badge>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="px-5 pt-4">
          <div className="db-surface px-4 py-3 text-sm" style={{ background: 'var(--db-danger-surface)', color: 'var(--db-danger-text)' }}>
            {error}
          </div>
        </div>
      ) : null}

      {!ready ? (
        <div className="px-5 pt-4 text-sm" style={{ color: 'var(--color-text-dim)' }}>
          Booting WebContainer…
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4 pb-[5.5rem]">
        <PanelCard title="Request" icon={<Route size={16} />} className="min-h-full">
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_auto]">
              <label className="grid gap-2 text-sm font-medium" style={{ color: 'var(--db-text-secondary)' }}>
                Method
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value as CurlMethod)}
                  className="db-control px-3 py-2 text-sm"
                >
                  {METHODS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium" style={{ color: 'var(--db-text-secondary)' }}>
                URL
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="db-control px-3 py-2 text-sm"
                  placeholder="http://localhost:3000/"
                  spellCheck={false}
                />
              </label>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={handleUseLocalhost}
                  className="db-action-secondary inline-flex items-center gap-2 px-3 py-2 text-sm font-medium"
                >
                  <RefreshCw size={14} />
                  Localhost
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunRequest()}
                  disabled={running}
                  className="db-action-primary inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold"
                >
                  <Play size={14} />
                  {running ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>

            <label className="grid gap-2 text-sm font-medium" style={{ color: 'var(--db-text-secondary)' }}>
              Headers
              <textarea
                value={headersText}
                onChange={(event) => setHeadersText(event.target.value)}
                className="db-control min-h-[110px] px-3 py-2 font-mono text-xs"
                placeholder="Accept: application/json&#10;Authorization: Bearer token"
                spellCheck={false}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium" style={{ color: 'var(--db-text-secondary)' }}>
              Body
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="db-control min-h-[160px] px-3 py-2 font-mono text-xs"
                placeholder='{"message":"hello"}'
                spellCheck={false}
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--db-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={followRedirects}
                  onChange={(event) => setFollowRedirects(event.target.checked)}
                />
                Follow redirects
              </label>
              <button
                type="button"
                onClick={() => setDisplayMode('formatted')}
                className="db-tab px-3 py-1.5 text-sm font-semibold"
                data-active={displayMode === 'formatted'}
              >
                Formatted
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('raw')}
                className="db-tab px-3 py-1.5 text-sm font-semibold"
                data-active={displayMode === 'raw'}
              >
                Raw
              </button>
            </div>

          </div>
        </PanelCard>
      </div>

      <AnimatePresence>
        {drawerOpen && response ? (
          <motion.section
            key={response.command}
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute inset-x-5 bottom-5 z-20 overflow-hidden rounded-[var(--assessment-radius-shell)] border border-[var(--color-border-main)] bg-[var(--color-bg-panel)] shadow-[0_-18px_50px_rgba(0,0,0,0.28)]"
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--color-border-main)' }}>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-text-bold)' }}>
                  Response
                </div>
                <Badge tone={statusTone}>{parseStatusLabel(response)}</Badge>
                {response.contentType ? <Badge tone="neutral">{response.contentType}</Badge> : null}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDrawerExpanded((current) => !current)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-main)]"
                  aria-label={drawerExpanded ? 'Collapse response' : 'Expand response'}
                >
                  {drawerExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-main)]"
                  aria-label="Close response"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className={`overflow-hidden ${drawerHeightClass}`}>
              <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-xs uppercase tracking-[0.14em]" style={{ borderColor: 'var(--color-border-main)', color: 'var(--color-text-dim)' }}>
                  <span>{response.exitCode === 0 ? 'Request completed' : `Request exited ${response.exitCode ?? 'unknown'}`}</span>
                  <span>{`${response.durationMs} ms`}</span>
                </div>

                <div className="min-h-0 overflow-auto p-4">
                  <div className="grid min-h-0 gap-4">
                    {response.stderr.trim() ? (
                      <div className="db-surface-subtle px-3 py-2 text-sm" style={{ color: 'var(--db-text-secondary)' }}>
                        {response.stderr.trim()}
                      </div>
                    ) : null}

                    <div className="db-surface-subtle min-h-0 overflow-hidden">
                      <div className="border-b px-4 py-3 text-sm font-semibold" style={{ borderColor: 'var(--db-border-subtle)', color: 'var(--db-text-primary)' }}>
                        {displayMode === 'formatted' && formattedBody.isJson ? 'Formatted JSON' : 'Response body'}
                      </div>
                      <div className="min-h-0 overflow-auto">
                        <pre className="min-h-[240px] overflow-auto px-4 py-3 font-mono text-xs leading-6" style={{ color: 'var(--db-text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {displayMode === 'formatted' ? formattedBody.bodyText || response.responseBody : response.responseBody}
                        </pre>
                      </div>
                    </div>

                    <details className="db-surface-subtle">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold" style={{ color: 'var(--db-text-primary)' }}>
                        Response headers
                      </summary>
                      <div className="border-t px-4 py-4" style={{ borderColor: 'var(--db-border-subtle)' }}>
                        {Object.keys(response.headers).length ? (
                          <div className="grid gap-2">
                            {Object.entries(response.headers).map(([key, value]) => (
                              <div key={key} className="grid gap-1 text-sm md:grid-cols-[180px_minmax(0,1fr)]">
                                <div style={{ color: 'var(--db-text-primary)' }}>{prettyHeaderName(key)}</div>
                                <div className="font-mono text-xs" style={{ color: 'var(--db-text-secondary)' }}>{value}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
