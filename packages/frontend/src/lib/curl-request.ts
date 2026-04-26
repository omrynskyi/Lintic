import type { WebContainer } from '@webcontainer/api';

export type CurlMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface CurlRequestInput {
  method: CurlMethod;
  url: string;
  headersText: string;
  body: string;
  followRedirects: boolean;
}

export interface CurlResponseHeaders {
  statusLine: string | null;
  statusCode: number | null;
  statusText: string | null;
  headers: Record<string, string>;
  contentType: string | null;
}

export interface CurlResponse extends CurlResponseHeaders {
  command: string;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  responseBody: string;
  responseHeadersText: string;
}

const REQUEST_TIMEOUT_MS = 30_000;
const CURL_TEMP_ROOT = '.lintic/curl-panel';
const REQUEST_RUNNER_FILENAME = 'request-runner.mjs';
const REQUEST_RUNNER_SOURCE = `import { readFile } from 'node:fs/promises';

const inputPath = process.argv[2];
if (!inputPath) {
  process.stdout.write(JSON.stringify({ ok: false, error: 'Missing request file' }));
  process.exit(1);
}

const startedAt = Date.now();

try {
  const raw = await readFile(inputPath, 'utf8');
  const input = JSON.parse(raw);
  const headers = new Headers();
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    if (typeof value === 'string' && value.length > 0) {
      headers.set(name, value);
    }
  }

  const init = {
    method: input.method,
    headers,
    redirect: input.followRedirects ? 'follow' : 'manual',
  };

  if (input.body && input.method !== 'GET' && input.method !== 'HEAD') {
    init.body = input.body;
  }

  const response = await fetch(input.url, init);
  const responseHeaders = Object.fromEntries(response.headers.entries());
  const responseBody = await response.text();

  process.stdout.write(JSON.stringify({
    ok: true,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body: responseBody,
    durationMs: Date.now() - startedAt,
  }));
  process.exit(0);
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    durationMs: Date.now() - startedAt,
  }));
  process.exit(1);
}`;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string, onTimeout?: () => void): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    }),
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        onTimeout?.();
        reject(new Error(`Timeout after ${ms}ms: ${label}`));
      }, ms);
    }),
  ]);
}

function collectStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  const chunks: string[] = [];

  return (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      return chunks.join('');
    } finally {
      reader.releaseLock();
    }
  })();
}

function parseHeaderLines(headersText: string): CurlResponseHeaders {
  const normalized = headersText.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return {
      statusLine: null,
      statusCode: null,
      statusText: null,
      headers: {},
      contentType: null,
    };
  }

  const lines = normalized.split('\n');
  const statusIndices: number[] = [];
  lines.forEach((line, index) => {
    if (/^HTTP\/\d/i.test(line.trim())) {
      statusIndices.push(index);
    }
  });

  const statusIndex = statusIndices.at(-1);
  const statusLine = statusIndex !== undefined ? lines[statusIndex]!.trim() : null;
  const headerLines = statusIndex !== undefined ? lines.slice(statusIndex + 1) : lines;
  const headers: Record<string, string> = {};

  for (const line of headerLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      break;
    }
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }
    const name = trimmed.slice(0, separatorIndex).trim().toLowerCase();
    const value = trimmed.slice(separatorIndex + 1).trim();
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }

  const contentType = headers['content-type'] ?? null;
  const statusCode = statusLine ? Number.parseInt(statusLine.split(/\s+/)[1] ?? '', 10) || null : null;
  const statusText = statusLine ? statusLine.split(/\s+/).slice(2).join(' ') || null : null;

  return {
    statusLine,
    statusCode,
    statusText,
    headers,
    contentType,
  };
}

function parseHeadersText(headersText: string): string[] {
  return headersText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export function formatResponseBody(body: string, contentType: string | null): {
  bodyText: string;
  isJson: boolean;
} {
  const trimmed = body.trim();
  const looksLikeJson = Boolean(contentType?.toLowerCase().includes('json'))
    || (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'));

  if (!looksLikeJson) {
    return { bodyText: body, isJson: false };
  }

  try {
    return {
      bodyText: `${JSON.stringify(JSON.parse(body), null, 2)}\n`,
      isJson: true,
    };
  } catch {
    return { bodyText: body, isJson: false };
  }
}

export async function runCurlRequest(
  wc: WebContainer,
  input: CurlRequestInput,
): Promise<CurlResponse> {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestDir = `${CURL_TEMP_ROOT}/${requestId}`;
  const requestInputPath = `${requestDir}/request.json`;
  const runnerPath = `${requestDir}/${REQUEST_RUNNER_FILENAME}`;

  await wc.fs.mkdir(requestDir, { recursive: true });
  await wc.fs.writeFile(requestInputPath, JSON.stringify({
    method: input.method,
    url: input.url,
    headers: Object.fromEntries(parseHeadersText(input.headersText).map((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex <= 0) {
        return [line, ''];
      }
      const name = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      return [name, value];
    })),
    body: input.body,
    followRedirects: input.followRedirects,
  }, null, 2));
  await wc.fs.writeFile(runnerPath, REQUEST_RUNNER_SOURCE);

  const startedAt = Date.now();
  const process = await wc.spawn('node', [runnerPath, requestInputPath], {
    env: {
      TERM: 'dumb',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });

  const outputPromise = 'output' in process && process.output instanceof ReadableStream
    ? collectStream(process.output)
    : Promise.resolve('');

  let exitCode: number | null = null;
  let outputText = '';

  try {
    exitCode = await withTimeout(
      process.exit,
      REQUEST_TIMEOUT_MS,
      'request runner',
      () => {
        process.kill?.();
      },
    );
  } finally {
    outputText = await outputPromise.catch(() => '');
  }

  const rawOutput = outputText.trim();
  let parsedOutput: {
    ok: boolean;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: string;
    durationMs?: number;
    error?: string;
  };

  try {
    parsedOutput = JSON.parse(rawOutput) as typeof parsedOutput;
  } catch {
    parsedOutput = { ok: false, error: rawOutput || 'Request runner returned invalid output' };
  }

  const responseBody = parsedOutput.body ?? '';
  const responseHeadersText = parsedOutput.ok
    ? [
        `HTTP/1.1 ${parsedOutput.status ?? 0} ${parsedOutput.statusText ?? ''}`.trim(),
        ...(parsedOutput.headers ? Object.entries(parsedOutput.headers).map(([name, value]) => `${prettyHeaderName(name)}: ${value}`) : []),
      ].join('\n')
    : '';
  const parsedHeaders = parsedOutput.ok
    ? parseHeaderLines(responseHeadersText)
    : {
        statusLine: null,
        statusCode: null,
        statusText: null,
        headers: {},
        contentType: null,
      };
  const command = `${input.method} ${input.url}`;

  try {
    await wc.fs.rm(requestDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors.
  }

  return {
    command,
    exitCode,
    durationMs: parsedOutput.durationMs ?? (Date.now() - startedAt),
    stdout: rawOutput,
    stderr: parsedOutput.ok ? '' : (parsedOutput.error ?? rawOutput),
    responseBody,
    responseHeadersText,
    ...parsedHeaders,
  };
}

function prettyHeaderName(name: string): string {
  return name
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join('-');
}
