import type { Subject } from "cms-auth/application/interfaces/Authentication";

export type LocalLoginResult =
    | { ok: true; subject: Subject; cookie: string }
    | { ok: false; error: "invalid_credentials" | "rate_limited" };

/** Local login operations consumed by HTTP handlers, without access to stores. */
export interface LocalAuthenticationActions {
    readonly loginUrl: string;
    readonly defaultHome: string;
    authenticate(email: string | undefined, password: string | undefined): Promise<LocalLoginResult>;
    clearSession(): string;
}
