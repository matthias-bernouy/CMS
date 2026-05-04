import type { DefaultRole, Subject } from "@bernouy/core";

export type KeycloakConsumerConfig<Role extends string = DefaultRole> = {
    /**
     * OIDC issuer URL of the Keycloak realm, e.g.
     * `"http://localhost:8080/realms/aelf1er"`. The discovery document is
     * fetched from `${issuer}/.well-known/openid-configuration`.
     */
    issuer: string;

    /** OIDC `client_id` registered in the Keycloak realm. */
    clientId: string;

    /** OIDC client secret (required for confidential clients). */
    clientSecret: string;

    /**
     * Absolute base URL of this app (e.g. `"http://localhost:3000"`). Used
     * to derive `callbackUrl`, `postLogoutCallbackUrl`, `loginUrl` and
     * `logoutUrl`. Must match what is registered in Keycloak's Valid
     * Redirect URIs / Valid Post Logout Redirect URIs.
     */
    appBaseUrl: string;

    /** Path prefix under which this consumer mounts its routes. Defaults to `/auth`. */
    basePath?: string;

    /**
     * HMAC key used to sign the session and flight cookies. MUST be at
     * least 32 random bytes worth of entropy (e.g. `crypto.randomBytes(32)`
     * hex-encoded). Rotating this invalidates all existing sessions.
     */
    sessionSecret: string;

    /** Session lifetime in seconds. Defaults to 3600 (1h). */
    sessionTtlSeconds?: number;

    /** Local session cookie name. Defaults to `be5-session`. */
    cookieName?: string;

    /**
     * Forces the `Secure` cookie attribute. Auto-detected from
     * `appBaseUrl` (`https://` → true, `http://` → false).
     */
    cookieSecure?: boolean;

    /** Fallback URL when `returnTo` is missing. Defaults to `/`. */
    defaultReturnTo?: string;

    /** OIDC scopes to request. Defaults to `["openid", "profile", "email"]`. */
    scopes?: string[];

} & ([DefaultRole] extends [Role]
    ? {
        /**
         * Maps the verified claims (id_token + access_token merged) to a `Subject`.
         * Optional when `Role = DefaultRole` — the default mapper reads
         * Keycloak's `realm_access.roles` and promotes `"admin"` over `"user"`.
         * Override for client roles, custom claims, or external role sources.
         *
         * Returning `null` aborts the login with an error page.
         */
        claimsToSubject?: (claims: Record<string, unknown>) => Subject<Role> | null;
    }
    : {
        /**
         * Maps the verified claims (id_token + access_token merged) to a `Subject`.
         * REQUIRED when `Role` is customized beyond `DefaultRole`: the default
         * mapper only produces `"admin" | "user"`, so the socle can't guess
         * your role names, priority order, or source claim.
         *
         * Returning `null` aborts the login with an error page.
         */
        claimsToSubject: (claims: Record<string, unknown>) => Subject<Role> | null;
    });
