import type { LogStore, LogQuery, LogPage } from "src/interfaces/LogStore";
import { redactForTenant } from "src/core/log/redaction";

/**
 * Control-plane log read (`/admin/logs`) — base.md §10.5. Raw records, all
 * tenants/kinds, bounded by the store; the store handles filtering +
 * pagination, this layer is the thin pass-through that gives `api/` a single
 * call site (cf. `.claude/rules/api-folder.md`).
 */
export function readAdminLogs(store: LogStore, q: LogQuery): Promise<LogPage> {
    return store.query(q);
}

/**
 * Tenant log read (`/tenant/logs`) — base.md §10.3 / §10.5. Tenant scope
 * comes from the token (never the query), security records are filtered out,
 * and surviving records are redacted (kept fields = the safe minimum). Page
 * shape preserved (no nulls leak, no empty `nextCursor`).
 */
export async function readTenantLogs(
    store: LogStore, tenantId: string, q: Omit<LogQuery, "tenantId">,
): Promise<LogPage> {
    const page = await store.query({ ...q, tenantId });
    const items = page.items
        .map((r) => redactForTenant(r, tenantId))
        .filter((r): r is NonNullable<typeof r> => r !== null);
    return page.nextCursor ? { items, nextCursor: page.nextCursor } : { items };
}
