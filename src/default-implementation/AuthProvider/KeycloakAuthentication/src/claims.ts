import type { DefaultRole, Subject } from "../../../../interfaces/Authentication";

/**
 * Extracts the Subject from id_token + access_token merged claims. Defaults
 * to Keycloak conventions (`sub`, `realm_access.roles`,
 * `name`/`preferred_username`/`email`). Override via `config.claimsToSubject`
 * for different setups.
 */
export function defaultClaimsToSubject(claims: Record<string, unknown>): Subject<DefaultRole> | null {
    const sub = typeof claims.sub === "string" ? claims.sub : null;
    if (!sub) return null;

    const realmAccess = claims["realm_access"] as { roles?: string[] } | undefined;
    const roles = realmAccess?.roles ?? [];
    const role: DefaultRole = roles.includes("admin") ? "admin" : "user";

    const displayName =
        (typeof claims["name"] === "string" ? claims["name"] : undefined) ??
        (typeof claims["preferred_username"] === "string" ? claims["preferred_username"] : undefined) ??
        (typeof claims["email"] === "string" ? claims["email"] : undefined);

    return { identifier: sub, role, displayName };
}
