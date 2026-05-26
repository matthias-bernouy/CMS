import type { Hub } from "src/exports/Hub";
import { z } from "src/core/schemas/zodInit";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { NamespaceIdQuerySchema } from "src/core/schemas/namespace";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

const ResultSchema = z.object({ namespaceId: z.string() }).openapi("DeleteNamespaceResult");

export const meta: ApiOperationMeta = {
    summary:     "Delete a namespace (cascade)",
    description: "Deactivates the namespace on every TP it has a provision on (best-effort), then drops the namespace + provisions rows. Operator must accept the destructive side-effects on tenant-provisioners.",
    operationId: "deleteNamespace",
    tags:        ["namespaces"],
    request:     { query: NamespaceIdQuerySchema },
    responses: {
        200: { description: "Cascade-deleted",         schema: successEnvelope(ResultSchema) },
        404: { description: "Unknown namespace",       schema: HubErrorEnvelope },
        502: { description: "At least one TP failed",  schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const parsed = NamespaceIdQuerySchema.safeParse({
        namespaceId: new URL(req.url).searchParams.get("namespaceId"),
    });
    if (!parsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing or malformed `namespaceId` query param"));
    }
    try {
        await hub.deleteNamespace(parsed.data.namespaceId);
        return Response.json({ ok: true, data: { namespaceId: parsed.data.namespaceId } });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
