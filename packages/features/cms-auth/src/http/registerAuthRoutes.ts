import type { Runner } from "@bernouy/http-runner";
import type { LocalAuthentication } from "cms-auth/default-implementation/LocalAuthentication";
import type { OidcAuthentication } from "cms-auth/default-implementation/OidcAuthentication";
import type { IdentityProviderRepository } from "cms-auth/interfaces/IdentityProvider";
import { toLoginMethod } from "cms-auth/core/toLoginMethod";

export type AuthRoutesConfig<Role extends string> = {
    /** Prefix the auth flow mounts under (e.g. "/auth"). Must agree with the
     *  `loginPagePath`/`logoutPath`/`callbackBase` the backends were built with. */
    basePath: string;
    local?:   LocalAuthentication<Role>;
    oidc?:    OidcAuthentication<Role>;
};

export type AuthMethodsRoutesConfig = {
    /** Prefix the auth flow mounts under on this runner, e.g. "/auth". */
    basePath: string;
    /** Public auth prefix used in returned login URLs. Defaults to `basePath`. */
    publicBasePath?: string;
    identityProviders?: IdentityProviderRepository | null;
};

/**
 * Mounts the auth flow on a runner — the ONE place cms-auth touches routes:
 *
 *   POST <basePath>/login                 (local credentials)
 *   GET  <basePath>/logout
 *   GET  <basePath>/:provider/login       (OIDC redirect flow)
 *   GET  <basePath>/:provider/callback
 *
 * Backends are passive; the surface or runtime calling this decides the
 * runner, the prefix, and which backends exist at all.
 */
export function registerAuthRoutes<Role extends string>(runner: Runner, cfg: AuthRoutesConfig<Role>): void {
    runner.group(cfg.basePath, (r) => {
        if (cfg.local) {
            const local = cfg.local;
            r.addEndpoint("POST", "/login",  (req) => local.login(req));
            r.addEndpoint("GET",  "/logout", (req) => local.logout(req));
        }
        if (cfg.oidc) {
            const oidc = cfg.oidc;
            r.addEndpoint("GET", "/:provider/login",    (req) => oidc.login(req));
            r.addEndpoint("GET", "/:provider/callback", (req) => oidc.callback(req));
        }
    });
}

export function registerAuthMethodsRoute(runner: Runner, cfg: AuthMethodsRoutesConfig): void {
    runner.group(cfg.basePath, (r) => {
        r.addEndpoint("GET", "/methods", async () => {
            const providers = cfg.identityProviders ? await cfg.identityProviders.list() : [];
            const authBasePath = cfg.publicBasePath ?? cfg.basePath;
            const methods = providers.filter((p) => p.enabled).map((p) => toLoginMethod(p, authBasePath));
            return Response.json(methods);
        });
    });
}
