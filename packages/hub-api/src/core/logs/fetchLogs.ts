import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";

/** Filters forwarded verbatim to the TP's `GET /admin/logs` (base.md §10.5). */
export interface LogQuery {
    tenantId?: string;
    kind?:     string;
    level?:    string;
    sinceTs?:  string;
    untilTs?:  string;
    limit?:    number;
    cursor?:   string;
}

/** A bounded log page as returned by the TP — proxied through untouched.
 *  `failedProviders` is set only by `fetchNamespaceLogs`: the deduped list of
 *  providerIds whose fetch failed, so a partial result is honest about what
 *  is missing rather than silently dropping it. */
export interface LogPage {
    items:            unknown[];
    nextCursor?:      string;
    failedProviders?: string[];
}

/** Read logs from a TP's control-plane `/admin/logs`. With `query.tenantId`
 *  the TP scopes to that tenant; without it, all tenants of the TP. The hub
 *  mints a fresh CP token (single-use, JTI replay) per call. */
export async function fetchProviderLogs(
    hub: Hub, providerId: string, query: LogQuery,
): Promise<LogPage> {
    const dp = await hub.imports.getByProviderId(providerId);
    if (!dp) throw new HubError("provider_not_found", `tenant-provisioner "${providerId}" is not imported`);

    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }

    const token = await hub.issuer.mint({ aud: providerId });
    const f     = hub.config.fetch ?? fetch;
    let res: Response;
    try {
        res = await f(`${dp.url}/admin/logs?${qs.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
    } catch (e) {
        throw new HubError("provider_unreachable",
            `${dp.url} unreachable for GET /admin/logs: ${e instanceof Error ? e.message : String(e)}`, e);
    }
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new HubError("provider_unreachable",
            `${dp.url} refused GET /admin/logs (status ${res.status}): ${detail}`);
    }
    return res.json() as Promise<LogPage>;
}

/** Read logs scoped to one tenant: resolve its TP, then forward `tenantId`. */
export async function fetchTenantLogs(
    hub: Hub, tenantId: string, query: Omit<LogQuery, "tenantId">,
): Promise<LogPage> {
    const tenant = await hub.namespaces.getTenant(tenantId);
    if (!tenant) throw new HubError("tenant_not_found", `unknown tenant "${tenantId}"`);
    return fetchProviderLogs(hub, tenant.providerId, { ...query, tenantId });
}

/** Read logs across ALL tenants of a namespace. Tenants may live on
 *  different TPs and `/admin/logs` only filters one `tenantId`, so we query
 *  each tenant, merge, sort by `ts` descending and truncate to `limit`.
 *  No cross-TP cursor (heterogeneous): the result is the latest `limit`
 *  entries, not a resumable page. A single unreachable TP must NOT sink the
 *  whole namespace: failures are collected (`allSettled`) and surfaced via
 *  `failedProviders` so the partial result is honest about what is missing. */
export async function fetchNamespaceLogs(
    hub: Hub, namespaceId: string, query: Omit<LogQuery, "tenantId" | "cursor">,
): Promise<LogPage> {
    const ns = await hub.namespaces.getNamespace(namespaceId);
    if (!ns) throw new HubError("namespace_not_found", `unknown namespace "${namespaceId}"`);

    const tenants = await hub.namespaces.listTenants(namespaceId);
    const limit   = query.limit ?? 50;

    const settled = await Promise.allSettled(
        tenants.map((t) => fetchProviderLogs(hub, t.providerId, { ...query, tenantId: t.tenantId, limit })),
    );

    const items = settled
        .flatMap((s) => s.status === "fulfilled" ? (s.value.items as { ts?: string }[]) : [])
        .sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")))
        .slice(0, limit);

    const failedProviders = [...new Set(
        tenants.flatMap((t, i) => settled[i]!.status === "rejected" ? [t.providerId] : []),
    )];

    return failedProviders.length ? { items, failedProviders } : { items };
}
