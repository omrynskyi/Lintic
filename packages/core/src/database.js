import { randomUUID, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
// ─── SQLiteAdapter ────────────────────────────────────────────────────────────
export class SQLiteAdapter {
    db;
    constructor(dbPath = 'lintic.db') {
        this.db = new Database(dbPath);
        this.init();
    }
    init() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        prompt_id TEXT NOT NULL,
        candidate_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        closed_at INTEGER,
        max_session_tokens INTEGER NOT NULL,
        max_message_tokens INTEGER NOT NULL,
        max_interactions INTEGER NOT NULL,
        context_window INTEGER NOT NULL,
        time_limit_minutes INTEGER NOT NULL,
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

      CREATE TABLE IF NOT EXISTS replay_events (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        type      TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        payload   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_replay_events_session
        ON replay_events(session_id, timestamp ASC);

      CREATE TABLE IF NOT EXISTS assessment_link_uses (
        link_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        used_at INTEGER NOT NULL
      );
    `);
    }
    createSession(config) {
        const id = randomUUID();
        const token = randomBytes(32).toString('hex');
        const now = Date.now();
        this.db.prepare(`
      INSERT INTO sessions (
        id, token, prompt_id, candidate_email, status, created_at,
        max_session_tokens, max_message_tokens, max_interactions,
        context_window, time_limit_minutes, tokens_used, interactions_used
      ) VALUES (
        ?, ?, ?, ?, 'active', ?,
        ?, ?, ?,
        ?, ?, 0, 0
      )
    `).run(id, token, config.prompt_id, config.candidate_email, now, config.constraint.max_session_tokens, config.constraint.max_message_tokens, config.constraint.max_interactions, config.constraint.context_window, config.constraint.time_limit_minutes);
        return Promise.resolve({ id, token });
    }
    getSession(id) {
        const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
        return Promise.resolve(row ? rowToSession(row) : null);
    }
    getSessionToken(id) {
        const row = this.db.prepare('SELECT token FROM sessions WHERE id = ?').get(id);
        return Promise.resolve(row?.token ?? null);
    }
    addMessage(sessionId, role, content, tokenCount) {
        this.db.prepare(`
      INSERT INTO messages (session_id, role, content, token_count, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, role, content, tokenCount, Date.now());
        return Promise.resolve();
    }
    getMessages(sessionId) {
        const rows = this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC').all(sessionId);
        const messages = rows.map((r) => ({
            id: r.id,
            session_id: r.session_id,
            role: r.role,
            content: r.content,
            token_count: r.token_count,
            created_at: r.created_at,
        }));
        return Promise.resolve(messages);
    }
    closeSession(id) {
        this.db.prepare(`
      UPDATE sessions SET status = 'completed', closed_at = ? WHERE id = ?
    `).run(Date.now(), id);
        return Promise.resolve();
    }
    listSessions() {
        const rows = this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
        return Promise.resolve(rows.map(rowToSession));
    }
    getSessionsByPrompt(promptId) {
        const rows = this.db.prepare('SELECT * FROM sessions WHERE prompt_id = ? ORDER BY created_at DESC').all(promptId);
        return Promise.resolve(rows.map(rowToSession));
    }
    validateSessionToken(id, token) {
        const row = this.db.prepare('SELECT id FROM sessions WHERE id = ? AND token = ?').get(id, token);
        return Promise.resolve(row !== undefined);
    }
    updateSessionUsage(id, additionalTokens, additionalInteractions) {
        this.db.prepare('UPDATE sessions SET tokens_used = tokens_used + ?, interactions_used = interactions_used + ? WHERE id = ?').run(additionalTokens, additionalInteractions, id);
        return Promise.resolve();
    }
    addReplayEvent(sessionId, type, timestamp, payload) {
        this.db.prepare('INSERT INTO replay_events (session_id, type, timestamp, payload) VALUES (?, ?, ?, ?)').run(sessionId, type, timestamp, JSON.stringify(payload));
        return Promise.resolve();
    }
    getReplayEvents(sessionId) {
        const rows = this.db.prepare('SELECT * FROM replay_events WHERE session_id = ? ORDER BY timestamp ASC, id ASC').all(sessionId);
        return Promise.resolve(rows.map((r) => ({
            id: r.id,
            session_id: r.session_id,
            type: r.type,
            timestamp: r.timestamp,
            payload: JSON.parse(r.payload),
        })));
    }
    markAssessmentLinkUsed(linkId, sessionId) {
        const result = this.db.prepare('INSERT OR IGNORE INTO assessment_link_uses (link_id, session_id, used_at) VALUES (?, ?, ?)').run(linkId, sessionId, Date.now());
        return Promise.resolve(result.changes > 0);
    }
    isAssessmentLinkUsed(linkId) {
        const row = this.db.prepare('SELECT link_id FROM assessment_link_uses WHERE link_id = ?').get(linkId);
        return Promise.resolve(row !== undefined);
    }
    getAssessmentLinkSessionId(linkId) {
        const row = this.db.prepare('SELECT session_id FROM assessment_link_uses WHERE link_id = ?').get(linkId);
        return Promise.resolve(row?.session_id ?? null);
    }
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function rowToSession(row) {
    const constraint = {
        max_session_tokens: row.max_session_tokens,
        max_message_tokens: row.max_message_tokens,
        max_interactions: row.max_interactions,
        context_window: row.context_window,
        time_limit_minutes: row.time_limit_minutes,
    };
    const session = {
        id: row.id,
        prompt_id: row.prompt_id,
        candidate_email: row.candidate_email,
        status: row.status,
        created_at: row.created_at,
        constraint,
        tokens_used: row.tokens_used,
        interactions_used: row.interactions_used,
    };
    if (row.closed_at !== null) {
        session.closed_at = row.closed_at;
    }
    if (row.score !== null) {
        session.score = row.score;
    }
    return session;
}
//# sourceMappingURL=database.js.map