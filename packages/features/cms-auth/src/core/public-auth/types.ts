import type { AuthEmailComposer } from "cms-auth/interfaces/AuthEmailComposer";
import type { AuthTokenStore } from "cms-auth/interfaces/AuthTokenStore";
import type { Emailer } from "cms-auth/interfaces/Emailer";
import type { LocalCredentialStore } from "cms-auth/interfaces/LocalCredentialStore";
import type { UsersRepository } from "cms-auth/interfaces/UsersRepository";

export type VerificationTarget = {
    sub: string;
    email: string;
    emailVerifiedAt: Date | null;
};

export type PublicAuthFlowConfig<Role extends string = string> = {
    credentials: LocalCredentialStore;
    users: UsersRepository<Role>;
    tokens: AuthTokenStore;
    emailer: Emailer;
    emailComposer?: AuthEmailComposer;
    defaultRole: Role;
    /** Frontend page where users land after clicking a verification email. */
    emailVerificationUrl: string;
    /** Frontend page where users land after clicking a password-reset email. */
    passwordResetUrl: string;
    siteName?: string;
    emailVerificationTtlSeconds?: number;
    passwordResetTtlSeconds?: number;
    /** Cooldown before another auth email can be sent for the same subject and
     *  purpose. Defaults to 5 minutes. Set 0 in tests/dev to disable. */
    authEmailCooldownSeconds?: number;
    buildEmailVerificationUrl?: (token: string) => string;
    buildPasswordResetUrl?: (token: string) => string;
};

export type SignupLocalUserInput = {
    email: string;
    password: string;
};

export type PublicAuthSendResult = {
    sent: boolean;
};

export type SignupLocalUserResult = PublicAuthSendResult & {
    created: boolean;
};
