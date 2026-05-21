import {
    requestContext, type ProviderDomain, type TenantConfigStore,
} from "@bernouy/data-provider-sdk";
import { banSearch, banReverse } from "./govApi";
import type { AddressesConfig } from "./tenantConfig";

const DEFAULT_LIMIT = 5;

/** Resolve the per-tenant `maxSuggestions`. Falls back to the schema default
 *  if no config has been saved yet (just-activated tenants). */
async function maxSuggestionsFor(store: TenantConfigStore, tenantId: string): Promise<number> {
    const cfg = (await store.get(tenantId)) as Partial<AddressesConfig> | null;
    const n = cfg?.maxSuggestions;
    return typeof n === "number" && n >= 1 && n <= 15 ? n : DEFAULT_LIMIT;
}

function badRequest(msg: string): Response {
    return Response.json(
        { type: "urn:data-provider:error/bad-request", title: "Bad Request", status: 400, detail: msg },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
    );
}

/**
 * Planes 2 & 3 for the addresses DP. Proxies BAN with a per-tenant
 * `maxSuggestions` cap. SDK middleware has already verified the caller +
 * scoped the tenant, so handlers just read `requestContext`.
 */
export function makeDomain(configStore: TenantConfigStore): ProviderDomain {
    return {
        mount(r) {
            // Plane 3 — consumption. Both routes are tenant-token-gated.

            r.get("/autocomplete", async (req) => {
                const { tenant } = requestContext(req);
                const q = new URL(req.url).searchParams.get("q") ?? "";
                if (q.trim().length < 3) {
                    return badRequest("query `q` must be at least 3 characters");
                }
                const limit = await maxSuggestionsFor(configStore, tenant.tenantId);
                const suggestions = await banSearch(q, limit);
                return Response.json({ suggestions });
            });

            r.get("/reverse", async (req) => {
                const { tenant } = requestContext(req);
                const params = new URL(req.url).searchParams;
                const lat = Number(params.get("lat"));
                const lon = Number(params.get("lon"));
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                    return badRequest("query `lat` and `lon` (numbers) are required");
                }
                const limit = await maxSuggestionsFor(configStore, tenant.tenantId);
                const all = await banReverse(lat, lon);
                return Response.json({ suggestions: all.slice(0, limit) });
            });
        },
        openapiConsumption: {
            openapi: "3.0.3",
            info:    { title: "addresses — consumption (France via BAN)", version: "1" },
            paths:   {},  // TODO: stub for now; could mirror the two routes above
        },
        openapiTenant: {
            openapi: "3.0.3",
            info:    { title: "addresses — tenant-admin", version: "1" },
            paths:   {},
        },
    };
}
