import { Pool, type PoolConfig } from 'pg';
import type { Session, Constraint, MessageRole, ReplayEventType } from './types.js';
export interface StoredMessage {
    id: number;
    session_id: string;
    role: MessageRole;
    content: string;
    token_count: number;
    created_at: number;
}
export interface StoredReplayEvent {
    id: number;
    session_id: string;
    type: ReplayEventType;
    timestamp: number;
    payload: unknown;
}
export interface CreateSessionConfig {
    prompt_id: string;
    candidate_email: string;
    constraint: Constraint;
}
export interface DatabaseAdapter {
    createSession(config: CreateSessionConfig): Promise<{
        id: string;
        token: string;
    }>;
    getSession(id: string): Promise<Session | null>;
    getSessionToken(id: string): Promise<string | null>;
    addMessage(sessionId: string, role: MessageRole, content: string, tokenCount: number): Promise<void>;
    getMessages(sessionId: string): Promise<StoredMessage[]>;
    closeSession(id: string): Promise<void>;
    listSessions(): Promise<Session[]>;
    getSessionsByPrompt(promptId: string): Promise<Session[]>;
    validateSessionToken(id: string, token: string): Promise<boolean>;
    updateSessionUsage(id: string, additionalTokens: number, additionalInteractions: number): Promise<void>;
    addReplayEvent(sessionId: string, type: ReplayEventType, timestamp: number, payload: unknown): Promise<void>;
    getReplayEvents(sessionId: string): Promise<StoredReplayEvent[]>;
    markAssessmentLinkUsed(linkId: string, sessionId: string): Promise<boolean>;
    isAssessmentLinkUsed(linkId: string): Promise<boolean>;
    getAssessmentLinkSessionId(linkId: string): Promise<string | null>;
}
export declare class SQLiteAdapter implements DatabaseAdapter {
    private readonly db;
    constructor(dbPath?: string);
    private init;
    createSession(config: CreateSessionConfig): Promise<{
        id: string;
        token: string;
    }>;
    getSession(id: string): Promise<Session | null>;
    getSessionToken(id: string): Promise<string | null>;
    addMessage(sessionId: string, role: MessageRole, content: string, tokenCount: number): Promise<void>;
    getMessages(sessionId: string): Promise<StoredMessage[]>;
    closeSession(id: string): Promise<void>;
    listSessions(): Promise<Session[]>;
    getSessionsByPrompt(promptId: string): Promise<Session[]>;
    validateSessionToken(id: string, token: string): Promise<boolean>;
    updateSessionUsage(id: string, additionalTokens: number, additionalInteractions: number): Promise<void>;
    addReplayEvent(sessionId: string, type: ReplayEventType, timestamp: number, payload: unknown): Promise<void>;
    getReplayEvents(sessionId: string): Promise<StoredReplayEvent[]>;
    markAssessmentLinkUsed(linkId: string, sessionId: string): Promise<boolean>;
    isAssessmentLinkUsed(linkId: string): Promise<boolean>;
    getAssessmentLinkSessionId(linkId: string): Promise<string | null>;
}
export interface PostgresAdapterConfig {
    connectionString: string;
    pool?: Pool;
    poolConfig?: Omit<PoolConfig, 'connectionString'>;
}
export declare class PostgresAdapter implements DatabaseAdapter {
    private readonly pool;
    private initializationPromise;
    constructor(config: PostgresAdapterConfig);
    initialize(): Promise<void>;
    createSession(config: CreateSessionConfig): Promise<{
        id: string;
        token: string;
    }>;
    getSession(id: string): Promise<Session | null>;
    getSessionToken(id: string): Promise<string | null>;
    addMessage(sessionId: string, role: MessageRole, content: string, tokenCount: number): Promise<void>;
    getMessages(sessionId: string): Promise<StoredMessage[]>;
    closeSession(id: string): Promise<void>;
    listSessions(): Promise<Session[]>;
    getSessionsByPrompt(promptId: string): Promise<Session[]>;
    validateSessionToken(id: string, token: string): Promise<boolean>;
    updateSessionUsage(id: string, additionalTokens: number, additionalInteractions: number): Promise<void>;
    addReplayEvent(sessionId: string, type: ReplayEventType, timestamp: number, payload: unknown): Promise<void>;
    getReplayEvents(sessionId: string): Promise<StoredReplayEvent[]>;
    markAssessmentLinkUsed(linkId: string, sessionId: string): Promise<boolean>;
    isAssessmentLinkUsed(linkId: string): Promise<boolean>;
    getAssessmentLinkSessionId(linkId: string): Promise<string | null>;
    private bootstrapSchema;
}
//# sourceMappingURL=database.d.ts.map