import type { SessionRecord, SessionRepository } from "auth/sessions/interfaces/SessionRepository";
import { MAX_ACCOUNT_SESSIONS } from "auth/sessions/core/sessionPolicy";

export class InMemorySessionRepository implements SessionRepository {
    private readonly accounts = new Map<string, { invalidatedBefore: number; sessions: SessionRecord[] }>();

    async create(session: SessionRecord, authenticatedAt: Date): Promise<boolean> {
        const account = this.accounts.get(session.sub) ?? { invalidatedBefore: 0, sessions: [] };
        if (authenticatedAt.getTime() <= account.invalidatedBefore) {
            return false;
        }
        account.sessions = account.sessions.filter((stored) => active(stored, session.createdAt));
        account.sessions.push(structuredClone(session));
        account.sessions = account.sessions.slice(-MAX_ACCOUNT_SESSIONS);
        this.accounts.set(session.sub, account);
        return true;
    }

    async touch(tokenHash: string, now: Date, idleTimeoutMs: number): Promise<SessionRecord | null> {
        for (const account of this.accounts.values()) {
            const session = account.sessions.find((stored) => stored.tokenHash === tokenHash);
            if (session && active(session, now)) {
                const next = {
                    ...session,
                    lastActivityAt: new Date(Math.max(session.lastActivityAt.getTime(), now.getTime())),
                    idleExpiresAt: new Date(Math.max(session.idleExpiresAt.getTime(), now.getTime() + idleTimeoutMs)),
                };
                account.sessions[account.sessions.indexOf(session)] = next;
                return structuredClone(next);
            }
        }
        return null;
    }

    async revoke(tokenHash: string): Promise<void> {
        for (const account of this.accounts.values()) {
            account.sessions = account.sessions.filter((session) => session.tokenHash !== tokenHash);
        }
    }

    async revokeForSub(sub: string, now: Date): Promise<void> {
        const account = this.accounts.get(sub) ?? { invalidatedBefore: 0, sessions: [] };
        account.invalidatedBefore = Math.max(account.invalidatedBefore, now.getTime());
        account.sessions = [];
        this.accounts.set(sub, account);
    }
}

function active(session: SessionRecord, now: Date): boolean {
    return session.idleExpiresAt > now && session.absoluteExpiresAt > now;
}
