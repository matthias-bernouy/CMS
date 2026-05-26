import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";

/** Read the live config from the TP for a tenant — mirrors what the SDK
 *  persists. The hub's row holds what was last sent; this returns the
 *  canonical value from the TP. */
export async function fetchTenantConfig(
    hub: Hub, tenantId: string,
): Promise<unknown | null> {
    const cur = await hub.namespaces.getTenant(tenantId);
    if (!cur) throw new HubError("tenant_not_found", `unknown tenant "${tenantId}"`);

    const dp = await hub.imports.getByProviderId(cur.providerId);
    if (!dp) throw new HubError("provider_not_found",
        `tenant-provisioner "${cur.providerId}" is not imported`);

    const token = await hub.issuer.mint({ aud: cur.providerId });
    const f     = hub.config.fetch ?? fetch;
    let res: Response;
    try {
        res = await f(`${dp.url}/admin/config?tenantId=${encodeURIComponent(tenantId)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
    } catch (e) {
        throw new HubError("provider_unreachable",
            `${dp.url} unreachable for GET /admin/config: ${e instanceof Error ? e.message : String(e)}`, e);
    }
    if (res.status === 404) return null;
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new HubError("provider_rejected_provisioning",
            `${dp.url} refused GET /admin/config (status ${res.status}): ${detail}`);
    }
    return res.json();
}
