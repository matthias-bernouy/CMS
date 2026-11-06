import type { SessionRepository } from "cms-auth/sessions/interfaces/SessionRepository";
import {
    mintSessionToken,
    sessionTokenHash,
    SESSION_IDLE_TIMEOUT_SECONDS,
    SESSION_ABSOLUTE_TIMEOUT_SECONDS,
} from "./sessionPolicy";

export type IssuedSession = Readonly<{ token: string; expiresAt: string }>;
export type SessionTokenServiceConfig = {
    repository: SessionRepository;
    idleTimeoutSeconds?: number;
    absoluteTimeoutSeconds?: number;
    now?: () => number;
};

/** Server-owned sessions; browser expiry is fixed at the absolute deadline. */
export class SessionTokenService {
    private readonly idleMs: number;
    private readonly absoluteMs: number;
    readonly now: () => number;

    constructor(private readonly config: SessionTokenServiceConfig) {
        const idle = config.idleTimeoutSeconds ?? SESSION_IDLE_TIMEOUT_SECONDS;
        const absolute = config.absoluteTimeoutSeconds ?? SESSION_ABSOLUTE_TIMEOUT_SECONDS;
        if (
            !Number.isSafeInteger(idle) ||
            !Number.isSafeInteger(absolute) ||
            idle <= 0 ||
            idle > absolute ||
            absolute > 31 * 86400
        ) {
            throw new RangeError("Session timeouts must be between 1 second and 31 days, with idle <= absolute");
        }
        this.idleMs = idle * 1000;
        this.absoluteMs = absolute * 1000;
        this.now = config.now ?? Date.now;
    }

    async issue(sub: string, authenticatedAt = this.now()): Promise<IssuedSession | null> {
        const now = this.now();
        if (
            !sub ||
            sub.length > 200 ||
            !Number.isSafeInteger(authenticatedAt) ||
            authenticatedAt > now ||
            now - authenticatedAt > 300_000
        ) {
            throw new TypeError("Invalid session authentication proof");
        }
        const token = mintSessionToken();
        const absoluteExpiresAt = new Date(now + this.absoluteMs);
        const created = await this.config.repository.create(
            {
                tokenHash: sessionTokenHash(token)!,
                sub,
                createdAt: new Date(now),
                lastActivityAt: new Date(now),
                idleExpiresAt: new Date(now + this.idleMs),
                absoluteExpiresAt,
            },
            new Date(authenticatedAt),
        );
        return created ? { token, expiresAt: absoluteExpiresAt.toISOString() } : null;
    }

    async readToken(token: string): Promise<{ sub: string } | null> {
        const hash = sessionTokenHash(token);
        const session = hash ? await this.config.repository.touch(hash, new Date(this.now()), this.idleMs) : null;
        return session ? { sub: session.sub } : null;
    }

    async revoke(token: string): Promise<void> {
        const hash = sessionTokenHash(token);
        if (hash) {
            await this.config.repository.revoke(hash);
        }
    }

    revokeForSub(sub: string): Promise<void> {
        return this.config.repository.revokeForSub(sub, new Date(this.now()));
    }
}
