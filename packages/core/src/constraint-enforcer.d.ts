import type { Constraint, ConstraintsRemaining } from './types.js';
export declare class ConstraintEnforcer {
    private readonly constraint;
    private readonly startedAt;
    private tokensUsed;
    private interactionsUsed;
    constructor(constraint: Constraint, startedAt?: number);
    canSend(): boolean;
    recordUsage(tokens: number): void;
    getRemaining(): ConstraintsRemaining;
    private elapsedSeconds;
}
//# sourceMappingURL=constraint-enforcer.d.ts.map