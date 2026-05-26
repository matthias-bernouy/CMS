import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import {
    ImportTenantProvisionerInputSchema, TenantProvisionerImportSchema,
} from "src/core/schemas/tenantProvisioner";
import { importTenantProvisioner } from "src/core/tenantProvisioner/importTenantProvisioner";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Import a tenant-provisioner",
    description: "Fetches the TP's 4 discovery documents (/.well-known/tenant-provisioner-info, /.well-known/oauth-authorization-server, JWKS, /openapi.admin.json, opt. /openapi.tenant-config.json), validates them, and stores the result in the hub's meta-registry. The TP MUST already trust the hub's iss as control-plane.",
    operationId: "importTenantProvisioner",
    tags:        ["providers"],
    request:     { body: ImportTenantProvisionerInputSchema },
    responses: {
        201: { description: "Imported",                              schema: successEnvelope(TenantProvisionerImportSchema) },
        400: { description: "Invalid body",                          schema: HubErrorEnvelope },
        409: { description: "Already imported (providerId/url/iss)", schema: HubErrorEnvelope },
        502: { description: "TP unreachable / refused hub trust",    schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    let raw: unknown;
    try { raw = await req.json(); }
    catch { return Response.json({ ok: false, error: { code: "validation_error", message: "invalid JSON body" } }, { status: 400 }); }

    const parsed = ImportTenantProvisionerInputSchema.safeParse(raw);
    if (!parsed.success) {
        return Response.json({ ok: false, error: { code: "validation_error", message: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") } }, { status: 400 });
    }

    try {
        const result = await importTenantProvisioner(hub, parsed.data);
        return Response.json({ ok: true, data: result }, { status: 201 });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
