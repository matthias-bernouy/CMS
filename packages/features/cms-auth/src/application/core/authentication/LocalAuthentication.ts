import type { Authentication, Subject } from "cms-auth/application/interfaces/Authentication";
import type {
    LocalAuthenticationActions,
    LocalLoginResult,
} from "cms-auth/application/interfaces/LocalAuthenticationActions";
import type { SignedCookieCodec } from "cms-auth/sessions/core/SignedCookieCodec";
import type { LocalCredentialStore } from "cms-auth/providers/interfaces/LocalCredentialStore";
import type { SubjectResolver } from "cms-auth/accounts/core/SubjectResolver";
import type { PatRepository } from "cms-auth/tokens/personal-access/interfaces/PatRepository";
import type { RateLimiter } from "@bernouy/rate-limiter";
import { SessionCookie } from "cms-auth/sessions/core/SessionCookie";
import { LocalPasswordProof } from "cms-auth/providers/core/local/LocalPasswordProof";
import { RequestSubjectResolver } from "cms-auth/application/core/authentication/RequestSubjectResolver";

export type LocalAuthConfig = {
    /** Identity-provider id this backend represents (provenance tag, e.g. "local"). */
    providerId: string;
    /** Page to send unauthenticated users to (used by `buildLoginUrl`). Full path. */
    loginPagePath: string;
    /** Full path of the logout endpoint (used by `buildLogoutUrl`) — must match
     *  where the surface mounts `localLogoutHandler`. */
    logoutPath: string;
    credentials: LocalCredentialStore;
    resolver: SubjectResolver;
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
 * (email/password). HTTP parsing and response construction belong to the
 * application HTTP handlers; this class only coordinates provider proof and
 * session issuance.
 *
 * The CMS terminates the session: on a successful `verify`, the identity flows
 * through `SubjectResolver` and a signed session cookie is issued.
 */
export class LocalAuthentication implements Authentication, LocalAuthenticationActions {
    readonly loginUrl: string;
    readonly logoutUrl: string;
    readonly profileUrl = "";

    private readonly sessions: SessionCookie;
    private readonly passwords: LocalPasswordProof;
    private readonly subjects: RequestSubjectResolver;

    constructor(private readonly cfg: LocalAuthConfig) {
        this.sessions = new SessionCookie({
            codec: cfg.codec,
            cookieName: cfg.cookieName,
            cookieSecure: cfg.cookieSecure,
            ttlSeconds: cfg.sessionTtlSeconds,
        });
        this.passwords = new LocalPasswordProof(cfg);
        this.subjects = new RequestSubjectResolver({ resolver: cfg.resolver, sessions: this.sessions, pats: cfg.pats });
        this.loginUrl = cfg.loginPagePath;
        this.logoutUrl = cfg.logoutPath;
    }

    buildLoginUrl(returnTo: string): string {
        return `${this.loginUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        return `${this.logoutUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    async getSubject(req: Request): Promise<Subject | null> {
        return this.subjects.resolve(req);
    }

    async authenticate(email: string | undefined, password: string | undefined): Promise<LocalLoginResult> {
        const proof = await this.passwords.verify(email, password);
        if (!proof.ok) {
            return { ok: false, error: proof.error };
        }
        const subject = await this.cfg.resolver.fromIdentity({ ...proof.identity, provider: this.cfg.providerId });
        return { ok: true, subject, cookie: await this.sessions.issue(subject.identifier) };
    }

    clearSession(): string {
        return this.sessions.clear();
    }

    get defaultHome(): string {
        return this.cfg.defaultHome ?? "/";
    }
}
