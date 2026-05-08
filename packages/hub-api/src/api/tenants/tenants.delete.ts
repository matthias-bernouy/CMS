import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { DeprovisionTenantQuerySchema, DeprovisionTenantResultSchema } from "src/core/schemas/deprovisionTenant";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Deprovision a tenant",
    description: "Deletes the CMS tenant row, both CDN buckets, and the Keycloak realm (in dependency order). Tolerates `not_found` everywhere; collects other errors into a single `deprovision_partial`.",
    operationId: "deprovisionTenant",
    tags:        ["tenants"],
    request:     { query: DeprovisionTenantQuerySchema },
    responses: {
        200: { description: "Tenant fully deprovisioned",                            schema: successEnvelope(DeprovisionTenantResultSchema) },
        400: { description: "Missing or malformed `slug` query param",               schema: HubErrorEnvelope },
        500: { description: "At least one downstream delete failed (non-not-found)", schema: HubErrorEnvelope },
    },
};

export default async function handleDeprovisionTenant(req: Request, hub: Hub): Promise<Response> {
    const slugRaw = new URL(req.url).searchParams.get("slug");
    const parsed = DeprovisionTenantQuerySchema.safeParse({ slug: slugRaw });
    if (!parsed.success) {
        return Response.json({ ok: false, error: { code: "validation_error", message: "missing or malformed `slug` query param" } }, { status: 400 });
    }

    try {
        await hub.deprovisionTenant(parsed.data.slug);
        return Response.json({ ok: true, data: { slug: parsed.data.slug } });
    } catch (err) {
        if (err instanceof HubError) {
            return Response.json({ ok: false, error: { code: err.code, message: err.message } }, { status: 500 });
        }
        throw err;
    }
}
