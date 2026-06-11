import type { IdentityProviderKind } from "cms-auth/interfaces/IdentityProvider";

/** Thrown when an auth input breaks a domain rule. Carries `.status` so any
 *  HTTP surface maps it to a 400 without importing surface error classes. */
export class AuthValidationError extends Error {
    status = 400;
    constructor(readonly field: string, readonly reason: string) {
        super(`Invalid ${field}: ${reason}`);
        this.name = "AuthValidationError";
    }
}

const MIN_PASSWORD = 8;

/** Password strength rule (length floor), owned by the auth feature. */
export function validatePassword(password: string): void {
    if (password.length < MIN_PASSWORD) {
        throw new AuthValidationError("password", `at least ${MIN_PASSWORD} characters`);
    }
}

const PROVIDER_KINDS: IdentityProviderKind[] = ["oidc", "local"];

export function isBuiltinProvider(kind: IdentityProviderKind | string): boolean {
    return kind === "local";
}

/** Identity-provider kind whitelist. Returns the validated kind. */
export function validateProviderKind(kind: string): IdentityProviderKind {
    if (!PROVIDER_KINDS.includes(kind as IdentityProviderKind)) {
        throw new AuthValidationError("kind", "must be oidc or local");
    }
    return kind as IdentityProviderKind;
}

const MAX_PAT_NAME = 100;

/** PAT label length rule. */
export function validatePatName(name: string): void {
    if (name.length > MAX_PAT_NAME) {
        throw new AuthValidationError("name", `max ${MAX_PAT_NAME} characters`);
    }
}
