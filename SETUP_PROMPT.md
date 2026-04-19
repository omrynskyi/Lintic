# Lintic Setup Prompt

```md
Install and configure Lintic for my company.

Repo: https://github.com/LinticAI/Lintic

Keep user-facing messages short. Do the reasoning yourself.

First inspect the repo so you understand the real setup flow. Check at least:
- `README.md`
- `package.json`
- `docker-compose.yml`
- `Dockerfile`
- `startdev.sh`
- `packages/cli/src/index.ts`
- `packages/backend/src/index.ts`
- `packages/core/src/setup.ts`
- existing `lintic.yml` and `.env` if present

Important repo facts:
- Lintic is a standalone app, but it can use existing company infra like model APIs, Postgres, reverse proxy, and secrets management.
- Build before using the CLI in this repo: run `npm install` then `npm run build` before `npx lintic init|migrate|doctor`.
- Local dev start: `npm run startdev`
- Production-style local start: `PORT=3300 node packages/backend/dist/index.js`
- Docker start: `docker compose up --build -d`
- DB options: SQLite by default, or Postgres via `database.connection_string` or `DATABASE_URL`

Available `lintic.yml` fields:
- top-level: `agent`, `constraints`, `prompts`, optional `database`, `api`, `evaluation`
- `agent`: `provider`, `model`, `api_key`, optional `base_url`
- `constraints`: `max_session_tokens`, `max_message_tokens`, `context_window`, `max_interactions`, `time_limit_minutes`
- `prompts[]`: `id`, `title`, optional `description`, `difficulty`, `tags`, `acceptance_criteria`, `rubric`
- `prompts[].rubric[]`: `question`, optional `guide`
- `database`: `provider`, optional `path`, `connection_string`
- `api`: optional `admin_key`, `secret_key`
- `evaluation`: `provider`, `model`, `api_key`, optional `base_url`, `max_history_messages`

Ask me one compact question batch before making major decisions:
1. Deployment mode: standalone Lintic, or standalone Lintic using existing company infra?
2. Runtime: Docker Compose, or local Node?
3. Model config: provider, model, base URL if needed, and where the API key comes from
4. Database: SQLite, existing Postgres, or local/dev Postgres?
5. Prompts: keep starter prompt, or replace with company prompts now?
6. Hostname/base URL, if known

If I leave something unspecified, use these defaults:
- deployment mode: standalone Lintic
- runtime: Docker Compose unless this is clearly local development
- database: SQLite unless I explicitly want Postgres
- prompts: keep starter prompt

Then implement the setup:
- clone the repo
- install deps
- build the repo
- if `lintic.yml` is missing, run `npx lintic init`
- create or update `.env.example` with the placeholders this setup needs
- update `lintic.yml` and `.env` as needed
- prefer env vars for secrets instead of hardcoding them
- configure the database connection details
- run `npx lintic migrate`
- run `npx lintic doctor`
- leave the install runnable

Use SQLite for the fastest standalone setup.
Use Postgres only if I explicitly want shared or existing infra.
If Postgres is chosen but no DB exists yet, ask one short follow-up: use an existing connection string, or provision a local/dev Postgres container now?

At the end, tell me exactly:
1. what you set up
2. whether you chose standalone or standalone-with-existing-infra
3. which files you changed
4. which env vars or secrets I need
5. the exact command(s) to start Lintic
6. any remaining manual steps
7. any defaults you applied
```
