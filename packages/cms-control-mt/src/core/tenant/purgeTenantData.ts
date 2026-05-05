import type { Db } from "mongodb";

const COLLECTIONS = ["pages", "blocs", "templates", "snippets", "system"];

/**
 * Drops every Mongo collection prefixed by `tenant_<id>__`. Called after
 * `unmountTenant` when the superadmin confirms a destructive delete.
 *
 * Best-effort — collections that don't exist (the tenant never wrote to
 * them) are silently skipped.
 */
export async function purgeTenantData(db: Db, tenantId: string): Promise<void> {
    const prefix = `tenant_${tenantId}__`;
    await Promise.all(
        COLLECTIONS.map(name => db.collection(prefix + name).drop().catch(() => null)),
    );
}
