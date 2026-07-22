import type { Authentication, Subject } from "cms-auth/interfaces/Authentication";
import type { SignedCookieCodec } from "cms-auth/core/SignedCookieCodec";
import type { LocalCredentialStore } from "cms-auth/interfaces/LocalCredentialStore";
import type { SubjectResolver } from "cms-auth/core/SubjectResolver";
import type { PatRepository } from "cms-auth/interfaces/PatRepository";
import type { RateLimiter } from "@bernouy/rate-limiter";
import { readCookie, setCookie, clearCookie, sanitizeReturnTo } from "cms-auth/core/cookies";
import { privateAuthJsonResponse, privateAuthResponse } from "cms-auth/http/authResponse";
import { readBearer, readCredentials } from "cms-auth/default-implementation/authentication/requestInput";

type SessionPayload = { kind: "session"; sub: string };
type LoginError = "invalid_credentials" | "rate_limited";
type LoginResult<Role extends string> =
    | { ok: true; subject: Subject<Role>; token: string; returnTo?: string }
    | { ok: false; error: LoginError; returnTo?: string };

export type LocalAuthConfig<Role extends string> = {
    /** Identity-provider id this backend represents (provenance tag, e.g. "local"). */
    providerId: string;
    /** Page to send unauthenticated users to (used by `buildLoginUrl`). Full path. */
    loginPagePath: string;
    /** Full path of the logout endpoint (used by `buildLogoutUrl`) — must match
     *  where the surface mounts `localLogoutHandler`. */
    logoutPath: string;
    credentials: LocalCredentialStore;
    resolver: SubjectResolver<Role>;
    codec: SignedCookieCodec;
    cookieName: string;
    cookieSecure?: boolean;
    sessionTtlSeconds?: number;
    /** Redirect target after login when no (safe) `returnTo` is given. */
    defaultHome?: string;
    /** Optional PAT store. When set, `getSubject` also accepts an
     *  `Authorization: Bearer <pat>` header — the CLI / server-to-server path. */
    pats?: PatRepository;
    /** Optional brute-force throttle for the password login path, keyed by
     *  email and checked BEFORE argon2 runs; a successful login clears it.
     *  Omit to disable throttling (dev / single-tenant). */
    rateLimit?: RateLimiter;
};

/**
 * Credential-style `Authentication` backend over a `LocalCredentialStore`
 * (email/password). Passive: exposes the `login`/`logout` handlers — the
 * surface mounts them through cms-auth's HTTP handlers, so the caller decides
 * paths, runner, and middlewares.
 *
 * The CMS terminates the session: on a successful `verify`, the identity flows
 * through `SubjectResolver` (authn → authz) and a signed session cookie is
 * issued. `getSubject` re-reads the role from the store every call, so role
 * changes take effect without re-login.
 */
export class LocalAuthentication<Role extends string = string> implements Authentication<Role> {
    readonly loginUrl: string;
    readonly logoutUrl: string;
    readonly profileUrl = "";

    private readonly _ttl: number;

    constructor(private readonly cfg: LocalAuthConfig<Role>) {
        this._ttl = cfg.sessionTtlSeconds ?? 3600;
        this.loginUrl = cfg.loginPagePath;
        this.logoutUrl = cfg.logoutPath;
    }

    buildLoginUrl(returnTo: string): string {
        return `${this.loginUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        return `${this.logoutUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    async getSubject(req: Request): Promise<Subject<Role> | null> {
        // Bearer (CLI / server-to-server) takes precedence over the cookie. A
        // presented-but-invalid PAT is rejected outright — it must not silently
        // fall through to whatever cookie the same request happens to carry.
        const bearer = readBearer(req);
        if (bearer) {
            if (!this.cfg.pats) {
                return null;
            }
            const principal = await this.cfg.pats.verify(bearer);
            return principal ? this.cfg.resolver.fromSub(principal.sub) : null;
        }

        const raw = readCookie(req, this.cfg.cookieName);
        if (!raw) {
            return null;
        }
        const payload = await this.cfg.codec.verify<SessionPayload>(raw);
        if (!payload || payload.kind !== "session") {
            return null;
        }
        return this.cfg.resolver.fromSub(payload.sub);
    }

    /** `POST <basePath>/login` handler — mounted by the surface. */
    async login(req: Request): Promise<Response> {
        const result = await this._authenticate(req);
        const back = result.returnTo ? `&returnTo=${encodeURIComponent(result.returnTo)}` : "";
        if (!result.ok) {
            const error = result.error === "rate_limited" ? "rate_limited" : "1";
            return privateAuthResponse(null, {
                status: 302,
                headers: { Location: `${this.cfg.loginPagePath}?error=${error}${back}` },
            });
        }
        const dest = sanitizeReturnTo(result.returnTo, this.cfg.defaultHome ?? "/");
        return privateAuthResponse(null, {
            status: 302,
            headers: { Location: dest, "Set-Cookie": this._sessionCookie(result.token) },
        });
    }

    /** JSON login handler for first-party public auth APIs. */
    async loginJson(req: Request): Promise<Response> {
        const result = await this._authenticate(req);
        if (!result.ok) {
            return privateAuthJsonResponse({ error: result.error }, result.error === "rate_limited" ? 429 : 401);
        }
        return privateAuthJsonResponse({ subject: result.subject }, 200, {
            "Set-Cookie": this._sessionCookie(result.token),
        });
    }

    /** `GET <basePath>/logout` handler — mounted by the surface. */
    logout(req: Request): Response {
        const dest = sanitizeReturnTo(new URL(req.url).searchParams.get("returnTo"), this.cfg.defaultHome ?? "/");
        return privateAuthResponse(null, {
            status: 302,
            headers: { Location: dest, "Set-Cookie": clearCookie(this.cfg.cookieName, this.cfg.cookieSecure ?? false) },
        });
    }

    /** JSON logout handler for first-party public auth APIs. */
    logoutJson(): Response {
        return privateAuthJsonResponse({ ok: true }, 200, {
            "Set-Cookie": clearCookie(this.cfg.cookieName, this.cfg.cookieSecure ?? false),
        });
    }

    private async _authenticate(req: Request): Promise<LoginResult<Role>> {
        const { email, password, returnTo } = await readCredentials(req);

        // Throttle by email BEFORE the expensive argon2 verify (brute-force + CPU-DoS).
        const rlKey = email && this.cfg.rateLimit ? `login:email:${email.trim().toLowerCase()}` : null;
        if (rlKey && this.cfg.rateLimit) {
            const { allowed } = await this.cfg.rateLimit.hit(rlKey);
            if (!allowed) {
                return { ok: false, error: "rate_limited", returnTo };
            }
        }

        const identity = email && password ? await this.cfg.credentials.verify(email, password) : null;
        if (!identity) {
            return { ok: false, error: "invalid_credentials", returnTo };
        }

        // A successful login clears the counter so earlier fumbles don't count.
        if (rlKey && this.cfg.rateLimit) {
            await this.cfg.rateLimit.reset(rlKey);
        }

        const subject = await this.cfg.resolver.fromIdentity({ ...identity, provider: this.cfg.providerId });
        const token = await this.cfg.codec.sign({ kind: "session", sub: subject.identifier }, this._ttl);
        return { ok: true, subject, token, returnTo };
    }

    private _sessionCookie(token: string): string {
        return setCookie(this.cfg.cookieName, token, this._ttl, this.cfg.cookieSecure ?? false);
    }
}
