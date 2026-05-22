import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";

export interface TenantInfoField {
    label: string;
    value: string;
    kind?: "text" | "url" | "code";
}

/** DP-computed read-only facts about a tenant — proxied through untouched. */
export interface TenantInfo {
    fields: TenantInfoField[];
}

/** Read a tenant's DP-computed info (base.md §8): resolve its DP, mint a fresh
 *  CP token, GET `/admin/info?tenantId=`. The DP returns empty `fields` when it
 *  declares no tenant-info capability. */
export async function fetchTenantInfo(hub: Hub, tenantId: string): Promise<TenantInfo> {
    const tenant = await hub.namespaces.getTenant(tenantId);
    if (!tenant) throw new HubError("tenant_not_found", `unknown tenant "${tenantId}"`);
    const dp = await hub.imports.getByProviderId(tenant.providerId);
    if (!dp) throw new HubError("provider_not_found", `data-provider "${tenant.providerId}" is not imported`);

    const token = await hub.issuer.mint({ aud: tenant.providerId });
    const f     = hub.config.fetch ?? fetch;
    const qs    = new URLSearchParams({ tenantId });
    let res: Response;
    try {
        res = await f(`${dp.url}/admin/info?${qs.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
    } catch (e) {
        throw new HubError("provider_unreachable",
            `${dp.url} unreachable for GET /admin/info: ${e instanceof Error ? e.message : String(e)}`, e);
    }
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new HubError("provider_unreachable",
            `${dp.url} refused GET /admin/info (status ${res.status}): ${detail}`);
    }
    return res.json() as Promise<TenantInfo>;
}
