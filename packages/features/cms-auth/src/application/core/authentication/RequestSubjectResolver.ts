import type { SubjectResolver } from "cms-auth/accounts/core/SubjectResolver";
import type { Subject } from "cms-auth/application/interfaces/Authentication";
import { readBearer } from "cms-auth/application/http/input/requestInput";
import type { SessionCookie } from "cms-auth/sessions/core/SessionCookie";
import type { PatRepository } from "cms-auth/tokens/personal-access/interfaces/PatRepository";

export type RequestSubjectResolverConfig = {
    resolver: SubjectResolver;
    sessions: SessionCookie;
    pats?: PatRepository;
};

/** Bearer is authoritative: an invalid bearer never falls back to a cookie. */
export class RequestSubjectResolver {
    constructor(private readonly config: RequestSubjectResolverConfig) {}

    async resolve(request: Request): Promise<Subject | null> {
        const bearer = readBearer(request);
        if (bearer) {
            const principal = this.config.pats ? await this.config.pats.verify(bearer) : null;
            return principal ? this.config.resolver.fromSub(principal.sub) : null;
        }
        const sub = await this.config.sessions.readSub(request);
        return sub === null ? null : this.config.resolver.fromSub(sub);
    }
}
