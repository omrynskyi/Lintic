import type { EvaluationConfig, PromptConfig, PromptRubricQuestion } from '@lintic/core';

// ─── Wire types (shared with SynchronousEvaluatorService) ────────────────────

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

const ANTHROPIC_BASE = 'https://api.anthropic.com';
const ANTHROPIC_API_VERSION = '2023-06-01';
const MAX_OUTPUT_TOKENS = 4096;

function resolveBaseUrl(config: EvaluationConfig): string {
  if (config.base_url) return config.base_url.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  if (config.provider === 'groq') return 'https://api.groq.com/openai';
  if (config.provider === 'cerebras') return 'https://api.cerebras.ai';
  if (config.provider === 'local-openai') return 'http://localhost:8080';
  return 'https://api.openai.com';
}

async function callAnthropicLLM(
  config: EvaluationConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const base = config.base_url
    ? config.base_url.replace(/\/v1\/?$/, '').replace(/\/$/, '')
    : ANTHROPIC_BASE;
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
    throw new Error(`LLM error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as AnthropicCompletionResponse;
  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock?.text) throw new Error('LLM returned no text content');
  return textBlock.text;
}

async function callOpenAICompatLLM(
  config: EvaluationConfig,
  systemPrompt: string,
  userMessage: string,
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
  if (config.provider !== 'local-openai') {
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
    throw new Error(`LLM error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as OpenAICompletionResponse;
  const msg = Array.isArray(data.choices) ? data.choices[0]?.message : undefined;
  const content = msg?.content || msg?.reasoning_content || undefined;
  if (!content) throw new Error('LLM returned empty content');
  return content;
}

async function callLLM(
  config: EvaluationConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  if (config.provider === 'anthropic-native') {
    return callAnthropicLLM(config, systemPrompt, userMessage);
  }
  return callOpenAICompatLLM(config, systemPrompt, userMessage);
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

// ─── Full task generation ─────────────────────────────────────────────────────

const GENERATE_TASK_SYSTEM_PROMPT = `You are an expert technical interviewer designing AI-assisted coding assessments.
Given a description, generate a complete coding assessment task for evaluating how well a software engineer collaborates with an AI assistant.

Return ONLY valid JSON with exactly this shape (no extra text, no markdown fences):
{
  "title": "Short task title",
  "description": "Full markdown description of the task including goal, requirements, and context",
  "difficulty": "easy" | "medium" | "hard",
  "tags": ["tag1", "tag2"],
  "acceptance_criteria": [
    "Specific, verifiable criterion 1",
    "Specific, verifiable criterion 2"
  ],
  "rubric": [
    { "question": "Did the candidate...?", "guide": "Look for evidence of..." },
    { "question": "How well did the candidate...?", "guide": "Assess whether..." }
  ]
}

Guidelines:
- acceptance_criteria: 3-6 concrete, pass/fail checkable criteria
- rubric: 3-5 open-ended evaluation questions with scoring guidance
- description: use markdown headers, be specific about requirements`;

export async function generateFullTask(
  userDescription: string,
  evalConfig: EvaluationConfig,
): Promise<Omit<PromptConfig, 'id'>> {
  const raw = await callLLM(evalConfig, GENERATE_TASK_SYSTEM_PROMPT, userDescription);
  const cleaned = stripCodeFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM returned invalid JSON for task generation: ${cleaned.slice(0, 300)}`);
  }

  const obj = parsed as Record<string, unknown>;
  const title = typeof obj['title'] === 'string' ? obj['title'].trim() : 'Generated Task';
  const description = typeof obj['description'] === 'string' ? obj['description'] : undefined;
  const difficulty = ['easy', 'medium', 'hard'].includes(obj['difficulty'] as string)
    ? (obj['difficulty'] as string)
    : undefined;
  const tags = Array.isArray(obj['tags'])
    ? (obj['tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  const acceptance_criteria = Array.isArray(obj['acceptance_criteria'])
    ? (obj['acceptance_criteria'] as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  const rubric = Array.isArray(obj['rubric'])
    ? (obj['rubric'] as unknown[]).flatMap((r) => {
        if (r === null || typeof r !== 'object' || Array.isArray(r)) return [];
        const rObj = r as Record<string, unknown>;
        if (typeof rObj['question'] !== 'string' || !rObj['question'].trim()) return [];
        const item: PromptRubricQuestion = { question: rObj['question'] };
        if (typeof rObj['guide'] === 'string') item.guide = rObj['guide'];
        return [item];
      })
    : [];

  return {
    title,
    ...(description ? { description } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(acceptance_criteria.length > 0 ? { acceptance_criteria } : {}),
    ...(rubric.length > 0 ? { rubric } : {}),
  };
}

// ─── Criteria generation for an existing task ─────────────────────────────────

const GENERATE_CRITERIA_SYSTEM_PROMPT = `You are an expert technical interviewer.
Given a task title and description, generate acceptance criteria and rubric questions for evaluating a candidate's AI-assisted solution.

Return ONLY valid JSON with exactly this shape (no extra text, no markdown fences):
{
  "acceptance_criteria": [
    "Specific, verifiable criterion 1",
    "Specific, verifiable criterion 2"
  ],
  "rubric": [
    { "question": "Did the candidate...?", "guide": "Look for evidence of..." },
    { "question": "How well did the candidate...?", "guide": "Assess whether..." }
  ]
}

Guidelines:
- acceptance_criteria: 3-6 concrete, pass/fail checkable criteria based on the task requirements
- rubric: 3-5 open-ended evaluation questions with guidance for scoring AI collaboration quality`;

export async function generateCriteriaForTask(
  task: Pick<PromptConfig, 'title' | 'description'>,
  evalConfig: EvaluationConfig,
): Promise<{ acceptance_criteria: string[]; rubric: PromptRubricQuestion[] }> {
  const userMessage = `Task title: ${task.title}\n\nTask description:\n${task.description ?? '(no description provided)'}`;
  const raw = await callLLM(evalConfig, GENERATE_CRITERIA_SYSTEM_PROMPT, userMessage);
  const cleaned = stripCodeFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM returned invalid JSON for criteria generation: ${cleaned.slice(0, 300)}`);
  }

  const obj = parsed as Record<string, unknown>;
  const acceptance_criteria = Array.isArray(obj['acceptance_criteria'])
    ? (obj['acceptance_criteria'] as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  const rubric = Array.isArray(obj['rubric'])
    ? (obj['rubric'] as unknown[]).flatMap((r) => {
        if (r === null || typeof r !== 'object' || Array.isArray(r)) return [];
        const rObj = r as Record<string, unknown>;
        if (typeof rObj['question'] !== 'string' || !rObj['question'].trim()) return [];
        const item: PromptRubricQuestion = { question: rObj['question'] };
        if (typeof rObj['guide'] === 'string') item.guide = rObj['guide'];
        return [item];
      })
    : [];

  return { acceptance_criteria, rubric };
}
