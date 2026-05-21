import type { Hub } from "src/exports/Hub";
import { z } from "src/core/schemas/zodInit";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import { NamespaceSchema } from "src/core/schemas/namespace";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

const QuerySchema = z.object({
    namespaceId: z.string().min(1).optional().openapi({ description: "If set, returns the single namespace or 404." }),
});

const NamespaceListSchema = z.object({
    namespaces: z.array(NamespaceSchema),
}).openapi("NamespaceList");

export const meta: ApiOperationMeta = {
    summary:     "List namespaces (or fetch one)",
    description: "Without `namespaceId`: returns the list. With `?namespaceId=X`: returns one or 404.",
    operationId: "listNamespaces",
    tags:        ["namespaces"],
    request:     { query: QuerySchema },
    responses: {
        200: { description: "Namespaces", schema: successEnvelope(z.union([NamespaceListSchema, NamespaceSchema])) },
        404: { description: "Unknown namespaceId", schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const namespaceId = new URL(req.url).searchParams.get("namespaceId");
    try {
        if (namespaceId) {
            const ns = await hub.getNamespace(namespaceId);
            if (!ns) throw new HubError("namespace_not_found", `unknown namespace "${namespaceId}"`);
            return Response.json({ ok: true, data: ns });
        }
        const namespaces = await hub.listNamespaces();
        return Response.json({ ok: true, data: { namespaces } });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
