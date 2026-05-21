import { join } from "node:path";
import type { Authentication, Runner } from "@bernouy/core";
import { serveApi, requireRole } from "@bernouy/core";
import type { Hub } from "src/exports/Hub";
import { hubApiPackageRoot } from "src/constants";

export type MountHubApiOptions<Role extends string> = {
    runner:        Runner;
    hub:           Hub;
    /** Authentication chain validating callers (typically a `KeycloakBearerConsumer`,
     *  optionally composed with a cookie consumer if you also expose a UI). */
    auth:          Authentication<Role>;
    /** Role required to call any `/api/*` endpoint. Default = `"superadmin"`. */
    requiredRole?: Role;
    /** Mount prefix for the gated API folder. Default = `"/api"`. */
    apiBasePath?:  string;
};

/**
 * Registers the hub's HTTP surface on the given runner:
 *   GET  /health                        — public liveness probe
 *   /.well-known/oauth-authorization-server + /jwks.json — public (the hub is an issuer)
 *   /api/providers/*                    — DP registry (import / refresh / unimport)
 *   /api/namespaces/*                   — namespace registry + per-DP provisions
 *   /api/issuer                         — hub-issuer metadata + allowlist snippet
 *
 * `/health` is intentionally public so a Docker HEALTHCHECK / load-balancer
 * probe can hit it without auth. All `/api/*` is gated by `requiredRole`
 * via the `Authentication` instance supplied by the consumer (the hub
 * itself does NOT manage identity post-pivot).
 */
export function mountHubApi<Role extends string>(opts: MountHubApiOptions<Role>): void {
    const requiredRole = opts.requiredRole ?? ("superadmin" as Role);
    const apiBasePath  = opts.apiBasePath  ?? "/api";
    const guard        = requireRole(opts.auth, requiredRole, { csrf: "cookie-only" });

    opts.runner.get("/health", () => Response.json({ ok: true, status: "alive" }));

    // The hub is itself an issuer (D5) — mount its /.well-known/oauth-...
    // and /jwks.json publicly so data-providers can verify hub-signed tokens.
    opts.hub.issuer.mount(opts.runner);

    opts.runner.group(apiBasePath, (api) => {
        serveApi(api, join(hubApiPackageRoot, "src/api"), opts.hub);
    }, [guard]);
}
