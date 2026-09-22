import type { SignedCookieCodec } from "cms-auth/sessions/core/SignedCookieCodec";
import { clearCookie, readCookie, setCookie } from "cms-auth/sessions/core/cookies";

type SessionPayload = { kind: "session"; sub: string };

export type SessionCookieConfig = {
    codec: SignedCookieCodec;
    cookieName: string;
    cookieSecure?: boolean;
    ttlSeconds?: number;
};

/** Shared signed CMS session cookie protocol used by local and OIDC login. */
export class SessionCookie {
    private readonly ttl: number;

    constructor(private readonly config: SessionCookieConfig) {
        this.ttl = config.ttlSeconds ?? 3600;
    }

    async issue(sub: string): Promise<string> {
        const token = await this.config.codec.sign({ kind: "session", sub }, this.ttl);
        return setCookie(this.config.cookieName, token, this.ttl, this.secure);
    }

    async readSub(request: Request): Promise<string | null> {
        const token = readCookie(request, this.config.cookieName);
        if (!token) {
            return null;
        }
        const payload = await this.config.codec.verify<SessionPayload>(token);
        return payload?.kind === "session" ? payload.sub : null;
    }

    clear(): string {
        return clearCookie(this.config.cookieName, this.secure);
    }

    private get secure(): boolean {
        return this.config.cookieSecure ?? false;
    }
}
