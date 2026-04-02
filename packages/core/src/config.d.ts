import type { AgentConfig, Constraint } from './types.js';
export interface PromptConfig {
    id: string;
    title: string;
    description?: string;
    difficulty?: string;
    tags?: string[];
}
export interface DatabaseConfig {
    provider: 'sqlite' | 'postgres';
    path?: string;
    connection_string?: string;
}
export interface ApiConfig {
    admin_key?: string;
    secret_key?: string;
}
export interface Config {
    agent: AgentConfig;
    constraints: Constraint;
    prompts: PromptConfig[];
    database?: DatabaseConfig;
    api?: ApiConfig;
}
export declare function resolveEnvVars(value: unknown): unknown;
export declare function validateConfig(raw: unknown): Config;
export declare function loadConfig(filePath: string): Config;
//# sourceMappingURL=config.d.ts.map