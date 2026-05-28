import type { IdentityProvider, LoginMethod } from "auth-core/interfaces/IdentityProvider";

/**
 * Project a configured provider to the non-secret `LoginMethod` descriptor the
 * public `/auth/methods` endpoint exposes. The form-vs-redirect distinction is
 * DERIVED from `kind`: `local` gets `fields` (a credentials form), everything
 * else gets a `loginUrl` (`<authBasePath>/<id>/login`) the bloc redirects to.
 * Callers filter out disabled providers first.
 */
export function toLoginMethod(p: IdentityProvider, authBasePath: string): LoginMethod {
    const base: LoginMethod = {
        id:          p.id,
        displayName: p.displayName,
        ...(p.icon ? { icon: p.icon } : {}),
    };
    return p.kind === "local"
        ? { ...base, fields: ["email", "password"] }
        : { ...base, loginUrl: `${authBasePath}/${p.id}/login` };
}
