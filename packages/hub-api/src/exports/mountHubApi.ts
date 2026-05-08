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
 *   GET  /health           — public liveness probe (200 if process is up)
 *   POST /api/tenants      — provisionTenant (gated by `requiredRole`)
 *   DELETE /api/tenants    — deprovisionTenant (gated)
 *   GET  /api/preflight    — runs `Hub.init()` end-to-end (gated)
 *
 * `/health` is intentionally public so a Docker HEALTHCHECK / load-balancer
 * probe can hit it without auth. The gated `/api/preflight` is the deeper
 * check that actually reaches Keycloak/cms/cdn.
 */
export function mountHubApi<Role extends string>(opts: MountHubApiOptions<Role>): void {
    const requiredRole = opts.requiredRole ?? ("superadmin" as Role);
    const apiBasePath  = opts.apiBasePath  ?? "/api";
    const guard        = requireRole(opts.auth, requiredRole, { csrf: "cookie-only" });

    opts.runner.get("/health", () => Response.json({ ok: true, status: "alive" }));

    opts.runner.group(apiBasePath, (api) => {
        serveApi(api, join(hubApiPackageRoot, "src/api"), opts.hub);
    }, [guard]);
}
