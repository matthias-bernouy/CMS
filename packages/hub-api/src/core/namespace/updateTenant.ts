import type { Hub } from "src/exports/Hub";
import type { Tenant } from "src/interfaces/Namespace";
import { HubError } from "src/core/HubError";
import type { UpdateTenantInput } from "src/core/schemas/namespace";

/** PATCH `/admin/tenants?tenantId=` on the DP with the changed fields, then
 *  mirror in the hub. `displayName` is hub-local only (the DP doesn't need
 *  it for routing). */
export async function updateTenant(
    hub: Hub,
    tenantId: string,
    input:    UpdateTenantInput,
): Promise<Tenant> {
    const cur = await hub.namespaces.getTenant(tenantId);
    if (!cur) throw new HubError("tenant_not_found", `unknown tenant "${tenantId}"`);

    const dp = await hub.imports.getByProviderId(cur.providerId);
    if (!dp) throw new HubError("provider_not_found",
        `data-provider "${cur.providerId}" is not imported`);

    const body: Record<string, unknown> = {};
    if (input.issuers !== undefined)        body.issuers = input.issuers;
    if (input.providerConfig !== undefined) body.providerConfig = input.providerConfig;
    if (input.status !== undefined)         body.status = input.status;

    if (Object.keys(body).length > 0) {
        const token = await hub.issuer.mint({ aud: cur.providerId });
        const f     = hub.config.fetch ?? fetch;
        let res: Response;
        try {
            res = await f(`${dp.url}/admin/tenants?tenantId=${encodeURIComponent(tenantId)}`, {
                method:  "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body:    JSON.stringify(body),
            });
        } catch (e) {
            throw new HubError("provider_unreachable",
                `${dp.url} unreachable for PATCH /admin/tenants: ${e instanceof Error ? e.message : String(e)}`, e);
        }
        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            if (res.status === 404) {
                throw new HubError("tenant_not_found",
                    `${dp.url} does not know tenant "${tenantId}"`, { detail });
            }
            throw new HubError("provider_rejected_provisioning",
                `${dp.url} refused PATCH /admin/tenants (status ${res.status}): ${detail}`);
        }
    }

    const patch: Partial<Pick<Tenant, "issuers" | "config" | "status" | "displayName">> = {};
    if (input.issuers !== undefined)        patch.issuers     = input.issuers;
    if (input.providerConfig !== undefined) patch.config      = input.providerConfig;
    if (input.status !== undefined)         patch.status      = input.status;
    if (input.displayName !== undefined)    patch.displayName = input.displayName;
    const updated = await hub.namespaces.updateTenant(tenantId, patch);
    return updated ?? cur;
}
