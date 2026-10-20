import type { Subject } from "cms-auth/accounts/interfaces/Subject";
import type { AuthenticationCredential } from "cms-auth/application/core/authentication/RequestSubjectResolver";

export type LocalLoginResult =
    | { ok: true; subject: Subject; session: { token: string; expiresAt: string } }
    | { ok: false; error: "invalid_credentials" | "rate_limited" };

/** Local login operations consumed by HTTP handlers, without access to stores. */
export interface LocalAuthenticationActions {
    authenticate(email: string | undefined, password: string | undefined): Promise<LocalLoginResult>;
    resolveCredential(credential: AuthenticationCredential | undefined): Promise<Subject | null>;
}
