import type {
  AcceptanceCriterionResult,
  EvaluationConfig,
  EvaluatorDimensionScore,
  EvaluatorResponse,
  InfrastructureMetrics,
  Iteration,
  PromptRubricQuestion,
  RubricDimension,
  RubricQuestionScore,
  Session,
} from '@lintic/core';
import { buildEvaluatorSystemPrompt, DEFAULT_RUBRIC_QUESTIONS, RUBRIC_DIMENSIONS } from '@lintic/core';

// ─── LLM Wire Types ───────────────────────────────────────────────────────────

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAICompletionResponse {
  choices: Array<{
    message: { content: string | null; reasoning_content?: string | null };
    finish_reason: string;
  }>;
}

interface AnthropicCompletionResponse {
  content: Array<{ type: string; text?: string }>;
}

// ─── Raw LLM call ─────────────────────────────────────────────────────────────

const ANTHROPIC_BASE = 'https://api.anthropic.com';
const ANTHROPIC_API_VERSION = '2023-06-01';
const MAX_OUTPUT_TOKENS = 8192;

function resolveBaseUrl(config: EvaluationConfig): string {
  if (config.base_url) return config.base_url.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  if (config.provider === 'groq') return 'https://api.groq.com/openai';
  if (config.provider === 'cerebras') return 'https://api.cerebras.ai';
  if (config.provider === 'local-openai') return 'http://localhost:8080';
  return 'https://api.openai.com';
}

async function callAnthropicEvaluator(
  config: EvaluationConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const base = config.base_url ? config.base_url.replace(/\/v1\/?$/, '').replace(/\/$/, '') : ANTHROPIC_BASE;
  const response = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.api_key,
      'anthropic-version': ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Anthropic evaluator error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json() as AnthropicCompletionResponse;
  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('Anthropic evaluator returned no text content');
  }
  return textBlock.text;
}

async function callOpenAICompatEvaluator(
  config: EvaluationConfig,
  systemPrompt: string,
  userMessage: string,
  opts: { jsonMode: boolean } = { jsonMode: true },
): Promise<string> {
  const base = resolveBaseUrl(config);
  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: MAX_OUTPUT_TOKENS,
  };
  // local-openai (LM Studio, Ollama, etc.) often doesn't support response_format;
  // rely on the prompt's JSON instructions instead.
  if (opts.jsonMode && config.provider !== 'local-openai') {
    body['response_format'] = { type: 'json_object' };
  }

  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Evaluator LLM error ${response.status}: ${text.slice(0, 200)}`);
  }

  const rawText = await response.text();
  let data: OpenAICompletionResponse;
  try {
    data = JSON.parse(rawText) as OpenAICompletionResponse;
  } catch {
    throw new Error(`Evaluator LLM returned non-JSON: ${rawText.slice(0, 300)}`);
  }

  const msg = Array.isArray(data.choices) ? data.choices[0]?.message : undefined;
  // Some local/thinking models put the reply in reasoning_content when content is empty
  const content = msg?.content || msg?.reasoning_content || undefined;
  if (!content) {
    console.error('[evaluator] unexpected response body:', rawText.slice(0, 500));
    throw new Error(`Evaluator LLM returned empty content. finish_reason=${data.choices?.[0]?.finish_reason ?? 'unknown'}`);
  }
  return content;
}

async function callEvaluatorLLM(
  config: EvaluationConfig,
  systemPrompt: string,
  userMessage: string,
  opts: { jsonMode: boolean } = { jsonMode: true },
): Promise<string> {
  if (config.provider === 'anthropic-native') {
    return callAnthropicEvaluator(config, systemPrompt, userMessage);
  }
  return callOpenAICompatEvaluator(config, systemPrompt, userMessage, opts);
}

// ─── Response Parsing ─────────────────────────────────────────────────────────

const VALID_DIMENSIONS = new Set<string>([
  'prompt_quality',
  'technical_direction',
  'iterative_problem_solving',
  'debugging_diagnosis',
  'robustness_edge_cases',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parseEvaluatorResponse(raw: string): EvaluatorResponse {
  let parsed: unknown;
  try {
    // Strip accidental markdown fences that some models add
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Evaluator returned non-JSON response: ${raw.slice(0, 100)}`);
  }

  if (!isRecord(parsed)) {
    throw new Error('Evaluator response missing required fields');
  }

  // Normalise flat format: { context_management: 3, ..., overall_summary: "..." }
  if (!Array.isArray(parsed['scores'])) {
    const flatScores: EvaluatorDimensionScore[] = [];
    for (const dim of RUBRIC_DIMENSIONS) {
      const val = parsed[dim.dimension];
      if (typeof val === 'number') {
        flatScores.push({
          dimension: dim.dimension,
          label: dim.label,
          score: Math.min(10, Math.max(0, val)),
          rationale: typeof parsed[`${dim.dimension}_rationale`] === 'string'
            ? (parsed[`${dim.dimension}_rationale`] as string)
            : '',
        });
      }
    }
    if (flatScores.length === 0 || typeof parsed['overall_summary'] !== 'string') {
      console.error('[evaluator] unexpected response shape:', JSON.stringify(parsed, null, 2).slice(0, 500));
      throw new Error('Evaluator response missing required fields');
    }
    return { scores: flatScores, overall_summary: parsed['overall_summary'] };
  }

  if (typeof parsed['overall_summary'] !== 'string') {
    console.error('[evaluator] unexpected response shape:', JSON.stringify(parsed, null, 2).slice(0, 500));
    throw new Error('Evaluator response missing required fields');
  }

  const scores: EvaluatorDimensionScore[] = [];
  for (const item of parsed['scores']) {
    if (!isRecord(item)) continue;
    const dim = item['dimension'];
    const label = item['label'];
    const score = item['score'];
    const rationale = item['rationale'];

    if (
      typeof dim !== 'string'
      || !VALID_DIMENSIONS.has(dim)
      || typeof label !== 'string'
      || typeof score !== 'number'
      || typeof rationale !== 'string'
    ) {
      continue;
    }

    scores.push({
      dimension: dim as RubricDimension,
      label,
      score: Math.min(10, Math.max(0, score)),
      rationale,
    });
  }

  if (scores.length === 0) {
    throw new Error('Evaluator returned no valid dimension scores');
  }

  // Parse optional acceptance_criteria_results
  const acceptance_criteria_results: AcceptanceCriterionResult[] = [];
  if (Array.isArray(parsed['acceptance_criteria_results'])) {
    for (const item of parsed['acceptance_criteria_results']) {
      if (!isRecord(item)) continue;
      const criterion = item['criterion'];
      const score = item['score'];
      const rationale = item['rationale'];
      if (typeof criterion === 'string' && typeof score === 'number' && typeof rationale === 'string') {
        acceptance_criteria_results.push({
          criterion,
          score: Math.min(100, Math.max(0, score)),
          rationale,
        });
      }
    }
  }

  // Parse optional rubric_scores
  const rubric_scores: RubricQuestionScore[] = [];
  if (Array.isArray(parsed['rubric_scores'])) {
    for (const item of parsed['rubric_scores']) {
      if (!isRecord(item)) continue;
      const question = item['question'];
      const score = item['score'];
      const rationale = item['rationale'];
      if (typeof question === 'string' && typeof score === 'number' && typeof rationale === 'string') {
        rubric_scores.push({
          question,
          score: Math.min(10, Math.max(0, score)),
          rationale,
          is_default: false, // will be tagged by caller
        });
      }
    }
  }

  return {
    scores,
    overall_summary: parsed['overall_summary'],
    ...(acceptance_criteria_results.length ? { acceptance_criteria_results } : {}),
    ...(rubric_scores.length ? { rubric_scores } : {}),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface EvaluateSessionInput {
  session: Session;
  iterations: Iteration[];
  infrastructure: InfrastructureMetrics;
  truncatedHistory: Array<{ role: string; content: string }>;
  evaluationConfig: EvaluationConfig;
  acceptanceCriteria?: string[];
  customRubricQuestions?: PromptRubricQuestion[];
}

/**
 * Calls the configured Evaluator LLM with the session context and returns
 * strongly-typed dimension scores.
 */
export async function evaluateSession(
  input: EvaluateSessionInput,
): Promise<EvaluatorResponse> {
  const { session, iterations, infrastructure, truncatedHistory, evaluationConfig, acceptanceCriteria, customRubricQuestions } = input;

  // Build the combined rubric question list: 5 defaults + any custom ones
  const allRubricQuestions: Array<{ question: string; is_default: boolean }> = [
    ...DEFAULT_RUBRIC_QUESTIONS.map((q) => ({ question: q, is_default: true })),
    ...(customRubricQuestions ?? []).map((q) => ({ question: q.question, is_default: false })),
  ];

  const systemPrompt = buildEvaluatorSystemPrompt({
    ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
    rubricQuestions: allRubricQuestions,
  });

  // Build user context using the session analyzer helper, adapted for the
  // pre-truncated history already provided by the caller.
  const historyText = truncatedHistory
    .map((m) => {
      const role = m.role === 'user' ? 'Candidate' : m.role === 'assistant' ? 'Agent' : m.role;
      const content = m.content ?? '';
      const text = content.length > 500 ? content.slice(0, 500) + '…' : content;
      return `[${role}]: ${text}`;
    })
    .join('\n\n');

  const rewindCount = iterations.filter((it) => it.rewound_at !== undefined).length;
  const iterationLines = iterations
    .map((it) => {
      const tag = it.rewound_at !== undefined ? ' [REWOUND]' : '';
      return `  Iteration ${it.index}${tag}: ${it.message_count} messages`;
    })
    .join('\n');

  const infraLines = [
    `  Caching effectiveness: ${Math.round(infrastructure.caching_effectiveness.score * 100)}% — ${infrastructure.caching_effectiveness.details}`,
    `  Error handling coverage: ${Math.round(infrastructure.error_handling_coverage.score * 100)}% — ${infrastructure.error_handling_coverage.details}`,
    `  Scaling awareness: ${Math.round(infrastructure.scaling_awareness.score * 100)}% — ${infrastructure.scaling_awareness.details}`,
  ].join('\n');

  const userMessage = `## Session Metadata
Session ID: ${session.id}
Prompt: ${session.prompt_id}
Candidate: ${session.candidate_email}
Tokens used: ${session.tokens_used} / ${session.constraint.max_session_tokens}
Interactions used: ${session.interactions_used} / ${session.constraint.max_interactions}

## Iteration Breakdown (${iterations.length} total, ${rewindCount} rewound)
${iterationLines}

## Infrastructure Metrics
${infraLines}

## Conversation History (${truncatedHistory.length} messages)
${historyText || '(no messages recorded)'}

---
Please evaluate the candidate using all 5 rubric dimensions${allRubricQuestions.length ? `, all ${allRubricQuestions.length} rubric questions` : ''}${acceptanceCriteria?.length ? `, and all ${acceptanceCriteria.length} acceptance criteria` : ''}.`;

  const rawResponse = await callEvaluatorLLM(evaluationConfig, systemPrompt, userMessage);
  const parsed = parseEvaluatorResponse(rawResponse);

  // Tag rubric_scores with is_default based on position in allRubricQuestions
  if (parsed.rubric_scores?.length) {
    const defaultQuestionSet = new Set(DEFAULT_RUBRIC_QUESTIONS);
    parsed.rubric_scores = parsed.rubric_scores.map((rs) => ({
      ...rs,
      is_default: defaultQuestionSet.has(rs.question),
    }));
  }

  return parsed;
}

// ─── Reviewer Q&A ──────────────────────────────────────────────────────────────

export interface AskSessionInput {
  candidateEmail: string;
  promptId: string;
  tokensUsed: number;
  maxTokens: number;
  interactionsUsed: number;
  maxInteractions: number;
  historyText: string;
  question: string;
  evaluationConfig: EvaluationConfig;
}

/**
 * Answers a free-form reviewer question about a candidate session using the
 * evaluator LLM, grounded only in the session transcript.
 */
export async function askAboutSession(input: AskSessionInput): Promise<string> {
  const {
    candidateEmail, promptId, tokensUsed, maxTokens,
    interactionsUsed, maxInteractions, historyText, question, evaluationConfig,
  } = input;

  const systemPrompt = `You are an expert technical interview assessor reviewing a software engineering candidate's coding session with an AI agent.
You have access to the candidate's full conversation transcript.
Answer the reviewer's question concisely (2–5 sentences) based only on what the session transcript shows.
Do not speculate beyond the evidence in the transcript. If the transcript doesn't contain enough information to answer, say so clearly.`;

  const userMessage = `## Session Context
Candidate: ${candidateEmail}
Prompt: ${promptId}
Tokens used: ${tokensUsed} / ${maxTokens}
Interactions: ${interactionsUsed} / ${maxInteractions}

## Conversation Transcript
${historyText || '(no messages recorded)'}

---
Reviewer question: ${question}`;

  return callEvaluatorLLM(evaluationConfig, systemPrompt, userMessage, { jsonMode: false });
}
