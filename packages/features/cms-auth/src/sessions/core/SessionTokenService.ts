import type { SignedCookieCodec } from "cms-auth/sessions/core/SignedCookieCodec";

type SessionPayload = { kind: "session"; sub: string };
export type IssuedSession = Readonly<{ token: string; expiresAt: string }>;

export type SessionTokenServiceConfig = {
    codec: SignedCookieCodec;
    ttlSeconds?: number;
};

/** Issues and verifies signed opaque session tokens without applying HTTP policy. */
export class SessionTokenService {
    private readonly ttl: number;

    constructor(private readonly config: SessionTokenServiceConfig) {
        this.ttl = config.ttlSeconds ?? 3600;
        if (!Number.isSafeInteger(this.ttl) || this.ttl <= 0 || this.ttl > 31 * 24 * 60 * 60) {
            throw new RangeError("Session token TTL must be between 1 second and 31 days");
        }
    }

    async issue(sub: string): Promise<IssuedSession> {
        const token = await this.config.codec.sign({ kind: "session", sub }, this.ttl);
        return { token, expiresAt: new Date(Date.now() + this.ttl * 1_000).toISOString() };
    }

    async readToken(token: string): Promise<(SessionPayload & { exp: number }) | null> {
        const payload = await this.config.codec.verify<SessionPayload>(token);
        return payload?.kind === "session" ? payload : null;
    }
}
