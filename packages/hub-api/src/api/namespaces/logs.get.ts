import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import { NamespaceLogsQuerySchema, LogPageSchema } from "src/core/schemas/logs";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Read a namespace's logs (all its tenants)",
    description: "Aggregates logs across every tenant of the namespace (possibly on different DPs), merged + sorted by ts desc, truncated to `limit`. No cursor (heterogeneous sources).",
    operationId: "fetchNamespaceLogs",
    tags:        ["logs"],
    request:     { query: NamespaceLogsQuerySchema },
    responses: {
        200: { description: "Merged log page",          schema: successEnvelope(LogPageSchema) },
        400: { description: "Invalid query",            schema: HubErrorEnvelope },
        404: { description: "Unknown namespace",        schema: HubErrorEnvelope },
        502: { description: "DP refused / unreachable", schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const parsed = NamespaceLogsQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing or malformed query params"));
    }
    const { namespaceId, ...query } = parsed.data;
    try {
        const data = await hub.fetchNamespaceLogs(namespaceId, query);
        return Response.json({ ok: true, data });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
