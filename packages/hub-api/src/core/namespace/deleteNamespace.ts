import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { removeTenant } from "./removeTenant";

/** Cascade-delete a namespace : remove every tenant on its DP, then drop
 *  the namespace metadata row. */
export async function deleteNamespace(hub: Hub, namespaceId: string): Promise<void> {
    const ns = await hub.namespaces.getNamespace(namespaceId);
    if (!ns) throw new HubError("namespace_not_found", `unknown namespace "${namespaceId}"`);

    const tenants = await hub.namespaces.listTenants(namespaceId);
    // Best-effort cascade : if a DP is unreachable, we still try the others +
    // surface the failure(s) in one combined error so the operator sees them.
    const errors: string[] = [];
    for (const t of tenants) {
        try {
            await removeTenant(hub, t.tenantId, { force: true });
        } catch (e) {
            errors.push(`${t.tenantId}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    await hub.namespaces.removeNamespace(namespaceId);

    if (errors.length > 0) {
        throw new HubError("provider_rejected_provisioning",
            `deleted namespace "${namespaceId}" but some tenants failed: ${errors.join("; ")}`);
    }
}
