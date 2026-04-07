export class ConstraintEnforcer {
    constraint;
    startedAt;
    tokensUsed = 0;
    interactionsUsed = 0;
    constructor(constraint, startedAt) {
        this.constraint = constraint;
        this.startedAt = startedAt ?? Date.now();
    }
    canSend() {
        return (this.tokensUsed < this.constraint.max_session_tokens &&
            this.interactionsUsed < this.constraint.max_interactions &&
            this.elapsedSeconds() < this.constraint.time_limit_minutes * 60);
    }
    recordUsage(tokens) {
        this.tokensUsed += tokens;
        this.interactionsUsed += 1;
        if (tokens > this.constraint.max_message_tokens) {
            throw new Error(`Constraint violated: message used ${tokens} tokens, limit is ${this.constraint.max_message_tokens} per message`);
        }
    }
    getRemaining() {
        const secondsAllowed = this.constraint.time_limit_minutes * 60;
        return {
            tokens_remaining: Math.max(0, this.constraint.max_session_tokens - this.tokensUsed),
            interactions_remaining: Math.max(0, this.constraint.max_interactions - this.interactionsUsed),
            seconds_remaining: Math.max(0, secondsAllowed - this.elapsedSeconds()),
        };
    }
    elapsedSeconds() {
        return (Date.now() - this.startedAt) / 1000;
    }
}
//# sourceMappingURL=constraint-enforcer.js.map