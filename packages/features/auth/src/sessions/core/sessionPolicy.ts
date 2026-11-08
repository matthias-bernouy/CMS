import { createHash, randomBytes } from "node:crypto";

export const SESSION_IDLE_TIMEOUT_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_ABSOLUTE_TIMEOUT_SECONDS = 30 * 24 * 60 * 60;
export const MAX_ACCOUNT_SESSIONS = 20;

export function mintSessionToken(): string {
    return `session_${randomBytes(32).toString("base64url")}`;
}

export function sessionTokenHash(token: string): string | null {
    return /^session_[A-Za-z0-9_-]{43}$/u.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}
