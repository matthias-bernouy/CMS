import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { denestDottedKeys, isPlainObject } from "src/core/denestDottedKeys";
import { UpdateNamespaceInputSchema, NamespaceSchema, NamespaceIdQuerySchema } from "src/core/schemas/namespace";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Update a namespace's metadata",
    description: "Patches displayName and/or description. namespaceId itself is immutable (it's also used as tenantId on every TP).",
    operationId: "updateNamespace",
    tags:        ["namespaces"],
    request:     { query: NamespaceIdQuerySchema, body: UpdateNamespaceInputSchema },
    responses: {
        200: { description: "Updated",         schema: successEnvelope(NamespaceSchema) },
        400: { description: "Validation",      schema: HubErrorEnvelope },
        404: { description: "Unknown",         schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const queryParsed = NamespaceIdQuerySchema.safeParse({
        namespaceId: new URL(req.url).searchParams.get("namespaceId"),
    });
    if (!queryParsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing or malformed `namespaceId` query param"));
    }
    let raw: unknown = {};
    try { raw = await req.json(); }
    catch { /* empty OK */ }
    const denested = isPlainObject(raw) ? denestDottedKeys(raw) : raw;
    const bodyParsed = UpdateNamespaceInputSchema.safeParse(denested);
    if (!bodyParsed.success) {
        return hubErrorResponse(new HubError("validation_error", "invalid body"));
    }
    if (bodyParsed.data.displayName === undefined && bodyParsed.data.description === undefined) {
        return hubErrorResponse(new HubError("validation_error", "at least one of `displayName` or `description` is required"));
    }

    try {
        const ns = await hub.updateNamespace(queryParsed.data.namespaceId, bodyParsed.data);
        if (!ns) return hubErrorResponse(new HubError("namespace_not_found",
            `unknown namespace "${queryParsed.data.namespaceId}"`));
        return Response.json({ ok: true, data: ns });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
