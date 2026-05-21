import { requestContext, type ProviderDomain } from "@bernouy/data-provider-sdk";
import type { NotesStore } from "./notesStore";

/**
 * Planes 2 & 3 — the provider's whole domain. No auth/plane/tenant code:
 * the SDK middleware already verified (§4.5), authorized the plane (§4.7)
 * and resolved + isolated the tenant (§5). No `/tenant/config` or
 * `/admin/config` handlers — those are **auto-mounted by the SDK**
 * (base.md §11 post-refactor). We just read `requestContext`.
 */
export function makeDomain(store: NotesStore): ProviderDomain {
    return {
        mount(r) {
            // Plane 3 — consumption (root prefix)
            r.get("/notes", (req) => {
                const { tenant } = requestContext(req);
                return Response.json({ notes: store.list(tenant.tenantId) });
            });
            r.post("/notes", async (req) => {
                const { tenant } = requestContext(req);
                const { note } = (await req.json()) as { note: string };
                store.add(tenant.tenantId, note);
                return new Response(null, { status: 204 });
            });
            // Plane 2 — tenant-admin (/tenant/* prefix)
            r.get("/tenant/stats", (req) => {
                const { tenant } = requestContext(req);
                return Response.json({ count: store.list(tenant.tenantId).length });
            });
        },
        openapiConsumption: { openapi: "3.0.3", info: { title: "notes — consumption", version: "1" }, paths: {} },
        openapiTenant:      { openapi: "3.0.3", info: { title: "notes — tenant-admin", version: "1" }, paths: {} },
    };
}
