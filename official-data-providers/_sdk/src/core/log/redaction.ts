import type { LogRecord } from "src/types/LogRecord";

/**
 * base.md §10.3 — tenant-audience view, **safe by construction**:
 *  - `security` (visibility control-plane) → never returned;
 *  - other tenant's records → never returned;
 *  - own records → `iss` + `ctx` (internal, e.g. `kid`) stripped;
 *    `sub` kept (the caller's own namespace).
 * Returns `null` when the record must not be visible to the tenant.
 */
export function redactForTenant(rec: LogRecord, callerTenantId: string): LogRecord | null {
    if (rec.visibility === "control-plane") return null;
    if (rec.tenantId !== callerTenantId)    return null;
    const { iss: _iss, ctx: _ctx, ...safe } = rec;
    return safe;
}
