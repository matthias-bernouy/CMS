import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";

/** Remove a tenant: DELETE on the DP then drop the local row. `force=true`
 *  overrides the DP's grace policy (base.md §8). Idempotent. */
export async function removeTenant(
    hub: Hub,
    tenantId: string,
    opts:     { force?: boolean } = {},
): Promise<void> {
    const cur = await hub.namespaces.getTenant(tenantId);
    if (!cur) return; // idempotent

    const dp = await hub.imports.getByProviderId(cur.providerId);
    if (!dp) {
        // The DP was unimported behind our back; just clean our row.
        await hub.namespaces.removeTenant(tenantId);
        return;
    }

    const token = await hub.issuer.mint({ aud: cur.providerId });
    const f     = hub.config.fetch ?? fetch;
    const qs    = new URLSearchParams({ tenantId });
    if (opts.force) qs.set("force", "true");

    let res: Response;
    try {
        res = await f(`${dp.url}/admin/tenants?${qs.toString()}`, {
            method:  "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
    } catch (e) {
        throw new HubError("provider_unreachable",
            `${dp.url} unreachable for DELETE /admin/tenants: ${e instanceof Error ? e.message : String(e)}`, e);
    }
    if (res.status !== 204 && res.status !== 200 && res.status !== 404) {
        const detail = await res.text().catch(() => "");
        throw new HubError("provider_rejected_provisioning",
            `${dp.url} refused DELETE /admin/tenants (status ${res.status}): ${detail}`);
    }
    await hub.namespaces.removeTenant(tenantId);
}
