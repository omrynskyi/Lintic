import { randomBytes, randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
function getSecretBytes(secretKey) {
    return new TextEncoder().encode(secretKey);
}
export function generateRandomSecret(length = 32) {
    return randomBytes(length).toString('hex');
}
export function resolveAdminKey(configured) {
    return process.env['LINTIC_ADMIN_KEY'] ?? configured;
}
export function resolveSecretKey(configured) {
    return process.env['LINTIC_SECRET_KEY'] ?? configured;
}
export async function createAssessmentLinkToken(claims, secretKey, expiresInHours = 72) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((issuedAt + expiresInHours * 3600) * 1000);
    const jti = randomUUID();
    const token = await new SignJWT({
        prompt_id: claims.prompt_id,
        email: claims.email,
        constraint: claims.constraint,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(issuedAt)
        .setJti(jti)
        .setExpirationTime(`${expiresInHours}h`)
        .sign(getSecretBytes(secretKey));
    return { token, expiresAt, jti };
}
export async function verifyAssessmentLinkToken(token, secretKey) {
    const verified = await jwtVerify(token, getSecretBytes(secretKey));
    const payload = verified.payload;
    if (typeof payload['prompt_id'] !== 'string'
        || typeof payload['email'] !== 'string'
        || typeof payload['jti'] !== 'string'
        || typeof payload['exp'] !== 'number'
        || typeof payload['constraint'] !== 'object'
        || payload['constraint'] === null) {
        throw new Error('Invalid assessment link payload');
    }
    return {
        prompt_id: payload['prompt_id'],
        email: payload['email'],
        constraint: payload['constraint'],
        jti: payload['jti'],
        exp: payload['exp'],
    };
}
export function buildAssessmentLink(baseUrl, token, promptId, email, expiresAt) {
    const normalizedBase = baseUrl.replace(/\/$/, '');
    const encodedToken = encodeURIComponent(token);
    return {
        url: `${normalizedBase}/assessment?token=${encodedToken}`,
        token,
        expires_at: expiresAt.toISOString(),
        prompt_id: promptId,
        email,
    };
}
//# sourceMappingURL=assessment-links.js.map