import type { Runner } from "@bernouy/core";
import type { MountedTenant } from "src/core/tenant/mountTenant";

/**
 * Tears down every route + default endpoint registered under the tenant's
 * `pathPrefix` (`/cms/<id>`). Idempotent — calling twice is a no-op past
 * the first run since the prefix tree is empty.
 *
 * Does NOT delete the tenant's data. Cascade purge of the `tenant_<id>__*`
 * collections lives in `core/tenant/purgeTenantData.ts` so callers can
 * unmount-then-revisit before committing to a destructive delete.
 */
export function unmountTenant(runner: Runner, mounted: MountedTenant): void {
    runner.removeRoutesByPathPrefix(mounted.pathPrefix);
}
