#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildAssessmentLink,
  closeDatabase,
  createAssessmentLinkToken,
  createDatabase,
  findConfigPath,
  generateRandomSecret,
  loadConfig,
  resolveAdminKey,
  resolveSecretKey,
  syncPromptsFromConfig,
  type DatabaseAdapter,
} from '@lintic/core';

export const VERSION: string = '0.0.1';

export interface GenerateLinkOptions {
  promptId: string;
  email: string;
  expiresInHours?: number;
  baseUrl?: string;
  configPath?: string;
}

export interface MigrateOptions {
  configPath?: string;
}

export interface MigrateResult {
  configPath: string;
  provider: 'sqlite' | 'postgres';
  created: number;
  skipped: number;
  createdPromptIds: string[];
  skippedPromptIds: string[];
}

export interface DoctorOptions {
  configPath?: string;
}

export interface DoctorCheck {
  label: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
  hint?: string;
}

export interface DoctorResult {
  ok: boolean;
  configPath: string;
  provider?: 'sqlite' | 'postgres';
  checks: DoctorCheck[];
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (!current?.startsWith('--') || next === undefined) {
      continue;
    }
    flags[current.slice(2)] = next;
    index += 1;
  }
  return flags;
}

function resolveCliConfigPath(configPath?: string): string {
  return configPath ? resolve(configPath) : findConfigPath();
}

function createCheck(
  status: DoctorCheck['status'],
  label: string,
  detail: string,
  hint?: string,
): DoctorCheck {
  return { label, status, detail, ...(hint ? { hint } : {}) };
}

function formatStatus(status: DoctorCheck['status']): string {
  if (status === 'pass') return 'PASS';
  if (status === 'fail') return 'FAIL';
  return 'SKIP';
}

export function createStarterConfig(): string {
  const adminKey = generateRandomSecret(16);
  const secretKey = generateRandomSecret(32);

  return `# Lintic starter configuration
# Replace example values and env placeholders before production use.

agent:
  # Primary coding agent used during live sessions.
  provider: openai-compatible
  api_key: \${OPENAI_API_KEY}
  model: gpt-4o
  # Local example:
  # provider: local-openai
  # api_key: local-dev
  # model: qwen2.5-coder
  # base_url: http://localhost:8080/v1

constraints:
  max_session_tokens: 50000
  max_message_tokens: 4000
  context_window: 32000
  max_interactions: 30
  time_limit_minutes: 60

database:
  # Local default: SQLite file next to lintic.yml.
  provider: sqlite
  path: ./lintic.db
  # Managed Postgres example:
  # provider: postgres
  # connection_string: \${DATABASE_URL}

api:
  # Admin key used by the admin/review APIs.
  admin_key: ${adminKey}
  # Secret used for signing assessment links.
  secret_key: ${secretKey}

evaluation:
  # Optional evaluator model used for review analysis.
  provider: openai-compatible
  api_key: \${OPENAI_API_KEY}
  model: gpt-4.1-mini
  # max_history_messages: 50

prompts:
  - id: library-api
    title: Library Catalog API
    description: Build a REST API that manages a library catalog.
    difficulty: medium
    tags: [backend, api-design]
    acceptance_criteria:
      - Create, update, list, and delete books.
      - Validate request payloads and return clear error responses.
    rubric:
      - question: Did the candidate structure the API clearly?
        guide: Reward clean routing, validation, and maintainable code organization.

# Add more prompts/tasks below as needed.
`;
}

export async function generateLink(options: GenerateLinkOptions): Promise<string> {
  const config = loadConfig(resolveCliConfigPath(options.configPath));
  const prompt = config.prompts.find((entry) => entry.id === options.promptId);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${options.promptId}`);
  }

  const secretKey = resolveSecretKey(config.api?.secret_key);
  if (!secretKey) {
    throw new Error('Missing API signing secret. Configure api.secret_key or LINTIC_SECRET_KEY.');
  }

  const generated = await createAssessmentLinkToken(
    {
      prompt_id: options.promptId,
      email: options.email,
      constraint: config.constraints,
    },
    secretKey,
    options.expiresInHours ?? 72,
  );

  const link = buildAssessmentLink(
    options.baseUrl ?? 'http://localhost:5173',
    generated.token,
    options.promptId,
    options.email,
    generated.expiresAt,
  );

  return link.url;
}

export async function migrateSetup(options: MigrateOptions = {}): Promise<MigrateResult> {
  const configPath = resolveCliConfigPath(options.configPath);
  const config = loadConfig(configPath);
  const provider = config.database?.provider ?? 'sqlite';
  const db = await createDatabase(config);

  try {
    const syncResult = await syncPromptsFromConfig(db, config.prompts);
    return {
      configPath,
      provider,
      created: syncResult.created,
      skipped: syncResult.skipped,
      createdPromptIds: syncResult.created_prompt_ids,
      skippedPromptIds: syncResult.skipped_prompt_ids,
    };
  } finally {
    await closeDatabase(db);
  }
}

export async function doctorSetup(options: DoctorOptions = {}): Promise<DoctorResult> {
  const fallbackConfigPath = options.configPath ? resolve(options.configPath) : resolve('lintic.yml');
  const checks: DoctorCheck[] = [];
  let configPath = fallbackConfigPath;

  try {
    configPath = resolveCliConfigPath(options.configPath);
    checks.push(createCheck('pass', 'Config file', `Using ${configPath}`));
  } catch (error) {
    checks.push(createCheck(
      'fail',
      'Config file',
      error instanceof Error ? error.message : String(error),
      'Create lintic.yml with `npx lintic init` or pass `--config <path>`.',
    ));
    return { ok: false, configPath, checks };
  }

  let config;
  try {
    config = loadConfig(configPath);
    checks.push(createCheck('pass', 'Config parsing', 'lintic.yml parsed and env vars resolved.'));
  } catch (error) {
    checks.push(createCheck(
      'fail',
      'Config parsing',
      error instanceof Error ? error.message : String(error),
      'Fill required env vars and fix validation errors in lintic.yml.',
    ));
    return { ok: false, configPath, checks };
  }

  checks.push(createCheck('pass', 'Agent config', `${config.agent.provider} / ${config.agent.model}`));

  if (config.evaluation) {
    checks.push(createCheck(
      'pass',
      'Evaluation config',
      `${config.evaluation.provider} / ${config.evaluation.model}`,
    ));
  } else {
    checks.push(createCheck('skip', 'Evaluation config', 'No evaluation block configured.'));
  }

  if (config.prompts.length > 0) {
    checks.push(createCheck('pass', 'Prompt/task definitions', `${config.prompts.length} prompt(s) configured.`));
  } else {
    checks.push(createCheck(
      'fail',
      'Prompt/task definitions',
      'No prompts configured.',
      'Add at least one entry under `prompts:` before running assessments.',
    ));
  }

  const adminKey = resolveAdminKey(config.api?.admin_key);
  if (adminKey) {
    checks.push(createCheck('pass', 'Admin access key', 'Admin key is configured.'));
  } else {
    checks.push(createCheck(
      'fail',
      'Admin access key',
      'Missing admin key.',
      'Set api.admin_key in lintic.yml or LINTIC_ADMIN_KEY in the environment.',
    ));
  }

  const secretKey = resolveSecretKey(config.api?.secret_key);
  if (secretKey) {
    checks.push(createCheck('pass', 'Signing secret', 'Assessment signing secret is configured.'));
  } else {
    checks.push(createCheck(
      'fail',
      'Signing secret',
      'Missing assessment signing secret.',
      'Set api.secret_key in lintic.yml or LINTIC_SECRET_KEY in the environment.',
    ));
  }

  let db: DatabaseAdapter | null = null;
  try {
    db = await createDatabase(config);
    checks.push(createCheck(
      'pass',
      'Database connection',
      `${config.database?.provider ?? 'sqlite'} database is reachable.`,
    ));
  } catch (error) {
    checks.push(createCheck(
      'fail',
      'Database connection',
      error instanceof Error ? error.message : String(error),
      'Verify database settings and credentials, then rerun `npx lintic migrate`.',
    ));
  }

  if (db) {
    try {
      await db.listPrompts();
      checks.push(createCheck('pass', 'Schema access', 'Core tables are accessible.'));
    } catch (error) {
      checks.push(createCheck(
        'fail',
        'Schema access',
        error instanceof Error ? error.message : String(error),
        'Run `npx lintic migrate` to provision the schema.',
      ));
    } finally {
      await closeDatabase(db);
    }
  } else {
    checks.push(createCheck('fail', 'Schema access', 'Skipped because the database connection failed.'));
  }

  return {
    ok: checks.every((check) => check.status !== 'fail'),
    configPath,
    provider: config.database?.provider ?? 'sqlite',
    checks,
  };
}

function printUsage(): void {
  console.log('Usage: lintic <init|migrate|doctor|generate-link> [options]');
}

function printMigrateResult(result: MigrateResult): void {
  console.log(`Config: ${result.configPath}`);
  console.log(`Database: ${result.provider}`);
  console.log('Schema: ready');
  console.log(`Prompts created: ${result.created}`);
  console.log(`Prompts skipped: ${result.skipped}`);
}

function printDoctorResult(result: DoctorResult): void {
  console.log(`Config: ${result.configPath}`);
  if (result.provider) {
    console.log(`Database: ${result.provider}`);
  }
  console.log('');
  for (const check of result.checks) {
    console.log(`[${formatStatus(check.status)}] ${check.label}: ${check.detail}`);
    if (check.hint) {
      console.log(`  Hint: ${check.hint}`);
    }
  }
}

export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  if (command === 'init') {
    const target = resolve('lintic.yml');
    if (existsSync(target)) {
      throw new Error('lintic.yml already exists');
    }
    writeFileSync(target, createStarterConfig(), 'utf8');
    console.log(`Created ${target}`);
    return;
  }

  if (command === 'migrate') {
    const result = await migrateSetup({
      ...(flags['config'] ? { configPath: flags['config'] } : {}),
    });
    printMigrateResult(result);
    return;
  }

  if (command === 'doctor') {
    const result = await doctorSetup({
      ...(flags['config'] ? { configPath: flags['config'] } : {}),
    });
    printDoctorResult(result);
    if (!result.ok) {
      throw new Error('Doctor checks failed');
    }
    return;
  }

  if (command === 'generate-link') {
    if (!flags['prompt']) {
      throw new Error('--prompt is required');
    }
    if (!flags['email']) {
      throw new Error('--email is required');
    }
    const options: GenerateLinkOptions = {
      promptId: flags['prompt'],
      email: flags['email'],
      ...(flags['expires-in-hours'] ? { expiresInHours: Number(flags['expires-in-hours']) } : {}),
      ...(flags['base-url'] ? { baseUrl: flags['base-url'] } : {}),
      ...(flags['config'] ? { configPath: flags['config'] } : {}),
    };
    const url = await generateLink(options);
    console.log(url);
    return;
  }

  printUsage();
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
