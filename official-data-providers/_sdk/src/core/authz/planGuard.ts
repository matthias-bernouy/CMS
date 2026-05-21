import type { AllowlistRole } from "src/interfaces/ProviderConfig";
import { PlaneError } from "src/core/errors";

export type Plane = "admin" | "tenant" | "consumption";

/** Map a request path to its plane (base.md §1.1 prefixes). */
export function planForPath(pathname: string): Plane {
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
    if (pathname === "/tenant" || pathname.startsWith("/tenant/")) return "tenant";
    return "consumption";
}

const REQUIRED: Record<Plane, AllowlistRole> = {
    admin:       "control-plane",
    tenant:      "tenant",
    consumption: "tenant",
};

/**
 * §4.7 authorization, applied once by the SDK middleware. Strict
 * cloisonnement: control-plane NEVER reaches plane 2/3; tenant NEVER reaches
 * `/admin/*`. Mismatch → `PlaneError` (403, mapped by 06).
 */
export function assertPlaneAllowed(role: AllowlistRole, pathname: string): Plane {
    const plane = planForPath(pathname);
    if (role !== REQUIRED[plane]) {
        throw new PlaneError(`role "${role}" not allowed on plane "${plane}"`);
    }
    return plane;
}
