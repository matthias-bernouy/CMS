import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { ProvisionTenantInputSchema, ProvisionTenantResultSchema } from "src/core/schemas/provisionTenant";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

const HTTP_BY_CODE: Record<string, number> = {
    validation_error:    400,
    keycloak_unreachable: 502,
    cms_unreachable:      502,
    cdn_unreachable:      502,
    provision_failed:     502,
    deprovision_partial:  500,
    unknown:              500,
};

export const meta: ApiOperationMeta = {
    summary:     "Provision a tenant end-to-end",
    description: "Creates the Keycloak realm + clients + role + admin user (with password-set magic link) + the CDN buckets + the CMS tenant row. Failure rolls back partial state best-effort.",
    operationId: "provisionTenant",
    tags:        ["tenants"],
    request:     { body: ProvisionTenantInputSchema },
    responses: {
        201: { description: "Tenant provisioned",                schema: successEnvelope(ProvisionTenantResultSchema) },
        400: { description: "Validation error on the request",   schema: HubErrorEnvelope },
        502: { description: "An upstream service failed (Keycloak / cms-mt / cdn-origin)", schema: HubErrorEnvelope },
    },
};

export default async function handleProvisionTenant(req: Request, hub: Hub): Promise<Response> {
    let raw: unknown;
    try { raw = await req.json(); }
    catch { return jsonError("validation_error", "invalid JSON body", 400); }

    const parsed = ProvisionTenantInputSchema.safeParse(raw);
    if (!parsed.success) {
        return jsonError("validation_error", parsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "), 400);
    }

    try {
        const result = await hub.provisionTenant(parsed.data);
        return Response.json({ ok: true, data: result }, { status: 201 });
    } catch (err) {
        if (err instanceof HubError) return jsonError(err.code, err.message, HTTP_BY_CODE[err.code] ?? 500);
        throw err;
    }
}

function jsonError(code: string, message: string, status: number): Response {
    return Response.json({ ok: false, error: { code, message } }, { status });
}
