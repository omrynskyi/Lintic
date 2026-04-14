import type { RubricDimension } from './types.js';

// ─── Rubric Dimension Definitions ────────────────────────────────────────────

export const RUBRIC_DIMENSIONS: Array<{
  dimension: RubricDimension;
  label: string;
  description: string;
}> = [
  {
    dimension: 'prompt_quality',
    label: 'Prompt Quality & Clarity',
    description:
      'Were the candidate\'s messages to the agent specific, well-scoped, and structured? Did they include relevant constraints and expected outcomes, or were requests vague and open-ended?',
  },
  {
    dimension: 'technical_direction',
    label: 'Technical Direction',
    description:
      'Did the candidate make deliberate architectural, framework, and design decisions and communicate them proactively to steer the agent, rather than deferring all technical choices to the LLM?',
  },
  {
    dimension: 'iterative_problem_solving',
    label: 'Iterative Problem Solving',
    description:
      'Did the candidate break work into individually verifiable steps, confirm results before proceeding, and course-correct efficiently when the agent went off track or produced incorrect output?',
  },
  {
    dimension: 'debugging_diagnosis',
    label: 'Debugging & Diagnosis',
    description:
      'When things broke, did the candidate supply hypotheses alongside error output ("I think the issue is X because..."), or just paste raw stack traces and wait for the agent to guess?',
  },
  {
    dimension: 'robustness_edge_cases',
    label: 'Robustness & Edge Cases',
    description:
      'Did the candidate proactively consider error handling, input validation, edge cases, and failure modes throughout the session, rather than only addressing the happy path?',
  },
];

// ─── Default Rubric Questions ─────────────────────────────────────────────────

export const DEFAULT_RUBRIC_QUESTIONS: string[] = [
  'Did the candidate articulate a plan or approach before jumping into implementation?',
  'Did the candidate make at least one deliberate technology or architectural decision and communicate it explicitly to the agent?',
  'Was the candidate\'s communication with the agent clear, specific, and directive rather than vague or passive?',
  'Did the candidate verify or test the agent\'s output before moving on to the next step?',
  'Did the candidate identify and address at least one edge case or error scenario?',
];

// ─── JSON Schema for Structured LLM Output ───────────────────────────────────

export const EVALUATOR_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    scores: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          dimension: { type: 'string' as const },
          label: { type: 'string' as const },
          score: { type: 'number' as const, minimum: 0, maximum: 10 },
          rationale: { type: 'string' as const },
        },
        required: ['dimension', 'label', 'score', 'rationale'] as const,
        additionalProperties: false,
      },
      minItems: 5,
      maxItems: 5,
    },
    overall_summary: { type: 'string' as const },
    acceptance_criteria_results: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          criterion: { type: 'string' as const },
          score: { type: 'number' as const, minimum: 0, maximum: 100 },
          rationale: { type: 'string' as const },
        },
        required: ['criterion', 'score', 'rationale'] as const,
        additionalProperties: false,
      },
    },
    rubric_scores: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          question: { type: 'string' as const },
          score: { type: 'number' as const, minimum: 0, maximum: 10 },
          rationale: { type: 'string' as const },
        },
        required: ['question', 'score', 'rationale'] as const,
        additionalProperties: false,
      },
    },
  },
  required: ['scores', 'overall_summary'] as const,
  additionalProperties: false,
};

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export interface EvaluatorPromptOpts {
  acceptanceCriteria?: string[];
  rubricQuestions?: Array<{ question: string; is_default: boolean }>;
}

export function buildEvaluatorSystemPrompt(opts?: EvaluatorPromptOpts): string {
  const dimensionLines = RUBRIC_DIMENSIONS.map(
    (d) => `- **${d.label}** (\`${d.dimension}\`): ${d.description}`,
  ).join('\n');

  const criteriaSection = opts?.acceptanceCriteria?.length
    ? `
## Acceptance Criteria

The prompt for this assessment includes specific acceptance criteria. For each criterion, score it 0–100 (percentage of completion — partial credit is expected):

- **0–49**: Not met or barely attempted
- **50–79**: Partially met with notable gaps
- **80–99**: Mostly met with minor gaps
- **100**: Fully met

Criteria to evaluate:
${opts.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Return these in the \`acceptance_criteria_results\` array with the exact criterion text, a score (0–100), and a brief rationale.
`
    : '';

  const rubricSection = opts?.rubricQuestions?.length
    ? `
## Rubric Questions

In addition to the dimensions above, score the following targeted questions 0–10 (same scale as dimensions):

${opts.rubricQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}

Return these in the \`rubric_scores\` array with the exact question text, a score (0–10), and a brief rationale.
`
    : '';

  return `You are an expert technical interview assessor evaluating how effectively a software engineering candidate collaborates with an AI coding agent.

You will receive a session transcript including the candidate's messages, the agent's responses, infrastructure usage data, and iteration metadata (including any rewind events).

Score the candidate on each of the following 5 dimensions from 0 to 10 (integers preferred, halves acceptable), with a concise rationale for each score. Then write a 2–4 sentence overall summary.

## Scoring Dimensions

${dimensionLines}

## Scoring Guidelines

- **0–3**: Poor. The candidate demonstrated little awareness or actively made things worse.
- **4–6**: Average. Some awareness but inconsistent application.
- **7–9**: Good. Consistent, effective application with minor gaps.
- **10**: Exceptional. A model example of the skill.
${criteriaSection}${rubricSection}
## Output Format

Return a single JSON object with the following keys:
- "scores": an array of exactly 5 objects, one per dimension. Each object must have: "dimension" (the key string), "label" (human-readable name), "score" (integer 0-10), "rationale" (1-2 sentences explaining the score).
- "overall_summary": a string with a 2-4 sentence summary.${opts?.acceptanceCriteria?.length ? '\n- "acceptance_criteria_results": an array of objects with "criterion", "score" (0–100), and "rationale".' : ''}${opts?.rubricQuestions?.length ? '\n- "rubric_scores": an array of objects with "question", "score" (0–10), and "rationale".' : ''}

Do not wrap in markdown fences. Output only the JSON object, nothing else.`;
}
