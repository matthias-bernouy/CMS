import { AuthError } from "src/core/errors";
import { getRequestAuth } from "src/core/http/requestAuth";

/**
 * Refuse a user-scoped tenant token (`sub` present). Use on endpoints that
 * change tenant-level state — e.g. `PATCH /tenant/config` (base.md §11.4 /
 * D10): only the tenant's own backend (M2M, no `sub`) may edit; end users
 * never write config.
 */
export function requireTenantScope(req: Request): void {
    const auth = getRequestAuth(req);
    if (auth.scope !== "tenant") throw new AuthError();
}
