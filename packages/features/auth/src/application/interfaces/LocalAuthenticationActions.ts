import type { Subject } from "auth/accounts/interfaces/Subject";
import type { AuthenticationCredential } from "auth/application/core/authentication/RequestSubjectResolver";

export type LocalLoginResult =
    | { ok: true; subject: Subject; session: { token: string; expiresAt: string } }
    | { ok: false; error: "invalid_credentials" | "rate_limited" };

/** Local login operations consumed by HTTP handlers, without access to stores. */
export interface LocalAuthenticationActions {
    authenticate(email: string | undefined, password: string | undefined): Promise<LocalLoginResult>;
    resolveCredential(credential: AuthenticationCredential | undefined): Promise<Subject | null>;
    revokeCredential(credential: AuthenticationCredential | undefined): Promise<void>;
    revokeSessionsForSub(sub: string): Promise<void>;
}
