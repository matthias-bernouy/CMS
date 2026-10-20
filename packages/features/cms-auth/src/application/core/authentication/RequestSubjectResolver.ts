import type { SubjectResolver } from "cms-auth/accounts/core/SubjectResolver";
import type { Subject } from "cms-auth/accounts/interfaces/Subject";
import type { SessionTokenService } from "cms-auth/sessions/core/SessionTokenService";
import type { PatRepository } from "cms-auth/tokens/personal-access/interfaces/PatRepository";

export type RequestSubjectResolverConfig = {
    resolver: SubjectResolver;
    sessions: SessionTokenService;
    pats?: PatRepository;
};

export type AuthenticationCredential =
    | { readonly kind: "bearer"; readonly token: string }
    | { readonly kind: "session"; readonly token: string };

/** Resolves the one credential selected at the browser-facing boundary. */
export class RequestSubjectResolver {
    constructor(private readonly config: RequestSubjectResolverConfig) {}

    async resolveCredential(credential: AuthenticationCredential | undefined): Promise<Subject | null> {
        if (!credential) {
            return null;
        }
        if (credential.kind === "bearer") {
            const principal = this.config.pats ? await this.config.pats.verify(credential.token) : null;
            return principal ? this.config.resolver.fromSub(principal.sub) : null;
        }
        const payload = await this.config.sessions.readToken(credential.token);
        return payload ? this.config.resolver.fromSub(payload.sub) : null;
    }
}
