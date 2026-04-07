# Contributing to Lintic

Thanks for contributing. The highest-value contribution surfaces are **agent adapters**, **prompt packs**, and **infrastructure mock plugins** — these extend the platform without touching core, and the community benefits immediately.

## Dev Environment Setup

**Requirements:** Node.js 20+, npm 10+, Docker (for integration testing)

```bash
git clone https://github.com/omrynskyi/Lintic.git
cd Lintic
npm install
npm run typecheck   # should exit 0
npm run lint        # should exit 0
npm run test        # should exit 0
```

## Contribution Surfaces

### Agent Adapters (`packages/adapters/`)

An adapter connects Lintic to any LLM. It implements the `AgentAdapter` interface from `@lintic/core`:

```typescript
import type { AgentAdapter, AgentConfig, SessionContext, AgentResponse, ToolDefinition, AgentCapabilities, TokenUsage } from '@lintic/core';

export class MyProviderAdapter implements AgentAdapter {
  async init(config: AgentConfig): Promise<void> { ... }
  async sendMessage(msg: string, context: SessionContext): Promise<AgentResponse> { ... }
  getTokenUsage(): TokenUsage { ... }
  getCapabilities(): AgentCapabilities { ... }
  getTools(): ToolDefinition[] { ... }
}
```

- Add your adapter under `packages/adapters/src/<provider-name>/`
- Unit tests required — mock all HTTP calls, no real API calls in tests
- Add your provider to `AgentProvider` in `packages/core/src/types.ts` if it needs a named entry (most OpenAI-compatible providers don't)

### Prompt Packs

Prompts are defined in `lintic.yml` under the `prompts` array. A prompt pack is a standalone `.yml` file in `docs/prompts/` that users can copy into their config. Good prompts are:

- 2–4 sentences (like a real Jira ticket)
- Open-ended with multiple valid approaches
- Designed so optimal strategy changes with different constraint profiles

### Infrastructure Mock Plugins

Mock packages live in `packages/` and are installable inside WebContainers. They simulate real infrastructure (Redis, PostgreSQL, message queues) with configurable failure profiles. See `packages/` for existing examples.

## Branching and PRs

- **Never push directly to `main`**
- Branch name: `us-NNN-short-description` for user stories, `fix/short-description` for bugs, `adapter/provider-name` for new adapters
- One PR per user story or contribution surface
- PR title must include the story or feature ID: `[US-003] YAML config loader` or `[adapter] Groq`

## Running Tests

```bash
npm run test                    # all packages
npm run test --workspace=packages/core   # single package
```

Tests use Vitest. Mock all external I/O (HTTP, filesystem, DB) — no real API calls or disk writes in unit tests.

## PR Review Process

All PRs require:
- CI passing (typecheck + lint + test)
- At least one review from a maintainer
- Acceptance criteria checked off in `PRD.md` (for user story PRs)

Maintainers aim to review within 5 business days. For large PRs, open a draft early and ask for early feedback in the PR description.

## Questions

Open a [discussion](https://github.com/omrynskyi/Lintic/discussions) rather than an issue for general questions. Issues are for bugs and feature requests only.
