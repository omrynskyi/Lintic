import type { Message, MetricResult, Session, SessionRecording } from './types.js';
export interface MetricComputationInput {
    session?: Pick<Session, 'tokens_used' | 'interactions_used' | 'score' | 'constraint'>;
    messages?: Message[];
    recording?: Pick<SessionRecording, 'events'>;
    finalFiles?: Record<string, string>;
    correctnessScore?: number;
}
export declare function computeIterationEfficiency(input: MetricComputationInput): MetricResult;
export declare function computeTokenEfficiency(input: MetricComputationInput): MetricResult;
export declare function computeIndependenceRatio(input: MetricComputationInput): MetricResult;
export declare function computeRecoveryScore(input: MetricComputationInput): MetricResult;
export declare function computeSessionMetrics(input: MetricComputationInput): MetricResult[];
//# sourceMappingURL=metrics.d.ts.map