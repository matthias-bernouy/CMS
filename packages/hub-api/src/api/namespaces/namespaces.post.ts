import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { denestDottedKeys, isPlainObject } from "src/core/denestDottedKeys";
import { CreateNamespaceInputSchema, NamespaceSchema } from "src/core/schemas/namespace";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Create a namespace",
    description: "Pure metadata — the hub does NOT create Keycloak realms, OIDC clients, or users. A namespace is just a logical grouping of (TP × tenant) provisions.",
    operationId: "createNamespace",
    tags:        ["namespaces"],
    request:     { body: CreateNamespaceInputSchema },
    responses: {
        201: { description: "Namespace created",          schema: successEnvelope(NamespaceSchema) },
        400: { description: "Validation error",           schema: HubErrorEnvelope },
        409: { description: "namespaceId already taken",  schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    let raw: unknown;
    try { raw = await req.json(); }
    catch { return hubErrorResponse(new HubError("validation_error", "invalid JSON body")); }

    const denested = isPlainObject(raw) ? denestDottedKeys(raw) : raw;
    const parsed = CreateNamespaceInputSchema.safeParse(denested);
    if (!parsed.success) {
        return hubErrorResponse(new HubError(
            "validation_error",
            parsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
        ));
    }

    try {
        const ns = await hub.createNamespace(parsed.data);
        return Response.json({ ok: true, data: ns }, { status: 201 });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
