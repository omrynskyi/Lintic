# US-005: Database Abstraction Layer + SQLite Adapter Design

**Date:** 2026-03-27
**Story:** US-005 — Database abstraction layer and SQLite adapter
**Status:** Approved

---

## Context

Lintic needs a persistence layer to store sessions and messages. All database access goes through a `DatabaseAdapter` interface so the SQLite default can be swapped for Postgres (US-005b) without touching any other code. Assessment links are JWT tokens — stateless, time-limited, signed with an env-var secret.

---

## File Structure

All files live in `packages/core`:

| File | Purpose |
|------|---------|
| `src/database.ts` | `DatabaseAdapter` interface + `CreateSessionParams` type |
| `src/sqlite-adapter.ts` | `SQLiteAdapter` class using `better-sqlite3` |
| `src/sqlite-adapter.test.ts` | Tests against in-memory SQLite |
| `src/config.ts` | Add `DatabaseConfig` + `database` field to `Config` |
| `src/index.ts` | Export new types and classes |
| `package.json` | Add `better-sqlite3`, `jose`, `@types/better-sqlite3` |

---

## Config Schema

```yaml
database:
  provider: sqlite           # required: "sqlite" | "postgres"
  path: ./lintic.db          # optional (sqlite only), default ./lintic.db
  jwt_secret: ${LINTIC_JWT_SECRET}  # required
  link_expiry_hours: 168     # optional, default 168 (7 days)
```

### TypeScript types (in config.ts)

```ts
export interface DatabaseConfig {
  provider: 'sqlite' | 'postgres';
  path?: string;
  jwt_secret: string;
  link_expiry_hours?: number;
}

export interface Config {
  agent: AgentConfig;
  constraints: Constraint;
  prompts: PromptConfig[];
  database: DatabaseConfig;
}
```

### Validation

- `database.provider` must be `'sqlite'` or `'postgres'`
- `database.jwt_secret` must be a non-empty string
- `database.link_expiry_hours` if present must be a positive number

---

## DatabaseAdapter Interface (database.ts)

```ts
export interface CreateSessionParams {
  promptId: string;
  candidateEmail: string;
  constraint: Constraint;
}

export interface DatabaseAdapter {
  createSession(params: CreateSessionParams): Promise<{ sessionId: string; linkToken: string }>;
  getSession(id: string): Promise<Session | null>;
  addMessage(sessionId: string, role: MessageRole, content: string, tokenCount: number): Promise<void>;
  getMessages(sessionId: string): Promise<Message[]>;
  closeSession(id: string): Promise<void>;
  listSessions(): Promise<Session[]>;
  getSessionsByPrompt(promptId: string): Promise<Session[]>;
}
```

Re-uses `Session`, `Constraint`, `MessageRole`, `Message` from `types.ts`.

---

## SQLiteAdapter

### Constructor

```ts
constructor(config: { path?: string; jwt_secret: string; link_expiry_hours?: number })
```

Creates tables on construction (CREATE TABLE IF NOT EXISTS). Pass `':memory:'` in tests.

### Schema

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  constraint_json TEXT NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  interactions_used INTEGER NOT NULL DEFAULT 0,
  score REAL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

### JWT token

Uses `jose` (ESM-native, HS256):

```ts
const secret = new TextEncoder().encode(jwt_secret);
const token = await new SignJWT({ sub: sessionId })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime(`${link_expiry_hours ?? 168}h`)
  .sign(secret);
```

### Method behaviour

| Method | Behaviour |
|--------|-----------|
| `createSession` | Insert row with `crypto.randomUUID()` id, `Date.now()` created_at, serialised constraint JSON → sign JWT → return `{ sessionId, linkToken }` |
| `getSession` | SELECT by id → parse `constraint_json` → return typed `Session \| null` |
| `addMessage` | INSERT into messages with `Date.now()` created_at |
| `getMessages` | SELECT all for session ORDER BY created_at ASC → return `Message[]` |
| `closeSession` | UPDATE status='completed', closed_at=Date.now() |
| `listSessions` | SELECT all ORDER BY created_at DESC |
| `getSessionsByPrompt` | SELECT WHERE prompt_id=? ORDER BY created_at DESC |

---

## Testing

All tests use `':memory:'` — real SQLite, no mocks, no disk I/O.

Coverage:
- `createSession` returns sessionId + valid JWT decoding to correct sessionId
- `getSession` returns null for unknown id; full Session after create
- `addMessage` / `getMessages` round-trip; messages ordered by created_at
- `closeSession` sets status and closed_at
- `listSessions` returns all sessions
- `getSessionsByPrompt` filters by promptId
- Config: missing `jwt_secret` throws; invalid `provider` throws
