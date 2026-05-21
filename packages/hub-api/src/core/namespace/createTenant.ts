import type { Hub } from "src/exports/Hub";
import type { Tenant } from "src/interfaces/Namespace";
import { HubError } from "src/core/HubError";
import { makeTenantId } from "./makeTenantId";
import type { CreateTenantInput } from "src/core/schemas/namespace";

/** Add a tenant to a namespace for a DP: mint a CP token, POST
 *  `/admin/tenants` on the DP with the tenant's id + issuers + optional
 *  config, persist the local row. A namespace may hold multiple tenants of
 *  the same DP, so this always creates a NEW row (no upsert). */
export async function createTenant(
    hub: Hub,
    namespaceId: string,
    providerId:  string,
    input:       CreateTenantInput,
): Promise<Tenant> {
    const ns = await hub.namespaces.getNamespace(namespaceId);
    if (!ns) throw new HubError("namespace_not_found", `unknown namespace "${namespaceId}"`);

    const dp = await hub.imports.getByProviderId(providerId);
    if (!dp) throw new HubError("provider_not_found", `data-provider "${providerId}" is not imported`);

    const tenantId    = input.tenantId ?? makeTenantId(namespaceId, providerId);
    const displayName = input.displayName ?? `${ns.displayName} · ${providerId}`;

    const token = await hub.issuer.mint({ aud: providerId });
    const f     = hub.config.fetch ?? fetch;

    let res: Response;
    try {
        res = await f(`${dp.url}/admin/tenants`, {
            method:  "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body:    JSON.stringify({
                tenantId,
                issuers: input.issuers,
                displayName,
                ...(input.providerConfig !== undefined ? { providerConfig: input.providerConfig } : {}),
            }),
        });
    } catch (e) {
        throw new HubError("provider_unreachable",
            `${dp.url}/admin/tenants unreachable: ${e instanceof Error ? e.message : String(e)}`, e);
    }
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new HubError("provider_rejected_provisioning",
            `${dp.url} refused POST /admin/tenants (status ${res.status}): ${detail}`);
    }

    const row: Tenant = {
        tenantId, namespaceId, providerId, displayName,
        issuers:     input.issuers,
        ...(input.providerConfig !== undefined ? { config: input.providerConfig } : {}),
        status:      "active",
        activatedAt: new Date(),
    };
    return hub.namespaces.insertTenant(row);
}
