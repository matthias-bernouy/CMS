import type { Subject } from "cms-auth/accounts/interfaces/Subject";
import type {
    LocalAuthenticationActions,
    LocalLoginResult,
} from "cms-auth/application/interfaces/LocalAuthenticationActions";
import type { SignedCookieCodec } from "cms-auth/sessions/core/SignedCookieCodec";
import type { LocalCredentialStore } from "cms-auth/providers/interfaces/LocalCredentialStore";
import type { SubjectResolver } from "cms-auth/accounts/core/SubjectResolver";
import type { PatRepository } from "cms-auth/tokens/personal-access/interfaces/PatRepository";
import type { RateLimiter } from "@bernouy/rate-limiter";
import { SessionTokenService } from "cms-auth/sessions/core/SessionTokenService";
import { LocalPasswordProof } from "cms-auth/providers/core/local/LocalPasswordProof";
import {
    RequestSubjectResolver,
    type AuthenticationCredential,
} from "cms-auth/application/core/authentication/RequestSubjectResolver";

export type LocalAuthConfig = {
    /** Identity-provider id this backend represents (provenance tag, e.g. "local"). */
    providerId: string;
    credentials: LocalCredentialStore;
    resolver: SubjectResolver;
    codec: SignedCookieCodec;
    sessionTtlSeconds?: number;
    /** Optional PAT store. When set, `getSubject` also accepts an
     *  `Authorization: Bearer <pat>` header — the CLI / server-to-server path. */
    pats?: PatRepository;
    /** Optional brute-force throttle for the password login path, keyed by
     *  email and checked BEFORE argon2 runs; a successful login clears it.
     *  Omit to disable throttling (dev / single-tenant). */
    rateLimit?: RateLimiter;
};

/**
 * Local credential proof, signed session issuance and opaque credential
 * resolution. HTTP and cookie response policy belong to the Kernel boundary.
 */
export class LocalAuthentication implements LocalAuthenticationActions {
    private readonly sessions: SessionTokenService;
    private readonly passwords: LocalPasswordProof;
    private readonly subjects: RequestSubjectResolver;

    constructor(private readonly cfg: LocalAuthConfig) {
        this.sessions = new SessionTokenService({
            codec: cfg.codec,
            ttlSeconds: cfg.sessionTtlSeconds,
        });
        this.passwords = new LocalPasswordProof(cfg);
        this.subjects = new RequestSubjectResolver({ resolver: cfg.resolver, sessions: this.sessions, pats: cfg.pats });
    }

    async resolveCredential(credential: AuthenticationCredential | undefined): Promise<Subject | null> {
        return this.subjects.resolveCredential(credential);
    }

    async authenticate(email: string | undefined, password: string | undefined): Promise<LocalLoginResult> {
        const proof = await this.passwords.verify(email, password);
        if (!proof.ok) {
            return { ok: false, error: proof.error };
        }
        const subject = await this.cfg.resolver.fromIdentity({ ...proof.identity, provider: this.cfg.providerId });
        return { ok: true, subject, session: await this.sessions.issue(subject.identifier) };
    }
}
