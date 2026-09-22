import type { JWTPayload } from "jose";

export type OidcIdentityClaims = {
    sub: string;
    email?: string;
};

export function readIdentityClaims(claims: JWTPayload): OidcIdentityClaims | null {
    const sub = String(claims.sub ?? "");
    if (!sub) {
        return null;
    }

    // Only trust an email address when the provider asserts it is verified.
    // The string variant is tolerated for compatibility with common providers.
    const emailVerified = claims.email_verified === true || claims.email_verified === "true";
    const email = emailVerified && typeof claims.email === "string" ? claims.email : undefined;
    return { sub, email };
}
