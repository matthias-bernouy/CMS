import type { ProviderContext } from "src/types/ProviderContext";
import { getRequestAuth } from "src/core/http/requestAuth";
import { AuthError } from "src/core/errors";

/**
 * Derive the verified `ProviderContext` for a plane-2/3 handler. The raw
 * JWT is intentionally NOT exposed (decision 02). Reaching here implies the
 * SDK middleware already verified (§4.5) + authorized the plane (§4.7) +
 * resolved & isolated the tenant (§5) — handlers must not re-check.
 */
export function requestContext(req: Request): ProviderContext {
    const a = getRequestAuth(req);
    // Plane 2/3 always carry a resolved tenant (tenant-role issuer, §4.7/§5).
    if (!a.tenant) throw new AuthError();
    return {
        tenant: a.tenant,
        role:   a.role,
        ...(a.claims.sub !== undefined ? { sub: a.claims.sub } : {}),
    };
}
