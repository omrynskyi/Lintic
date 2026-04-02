import type { Constraint } from './types.js';
export interface AssessmentLinkClaims {
    prompt_id: string;
    email: string;
    constraint: Constraint;
}
export interface AssessmentLinkPayload extends AssessmentLinkClaims {
    jti: string;
    exp: number;
}
export interface GeneratedAssessmentLink {
    url: string;
    token: string;
    expires_at: string;
    prompt_id: string;
    email: string;
}
export declare function generateRandomSecret(length?: number): string;
export declare function resolveAdminKey(configured?: string): string | undefined;
export declare function resolveSecretKey(configured?: string): string | undefined;
export declare function createAssessmentLinkToken(claims: AssessmentLinkClaims, secretKey: string, expiresInHours?: number): Promise<{
    token: string;
    expiresAt: Date;
    jti: string;
}>;
export declare function verifyAssessmentLinkToken(token: string, secretKey: string): Promise<AssessmentLinkPayload>;
export declare function buildAssessmentLink(baseUrl: string, token: string, promptId: string, email: string, expiresAt: Date): GeneratedAssessmentLink;
//# sourceMappingURL=assessment-links.d.ts.map