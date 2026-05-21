import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { hubErrorResponse } from "src/core/HubErrorHttp";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import { ProviderIdQuerySchema, DataProviderImportSchema } from "src/core/schemas/dataProvider";
import { refreshDataProvider } from "src/core/dataProvider/refreshDataProvider";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Refresh a data-provider's cached schemas",
    description: "Re-fetches the 4 discovery documents and updates the cache. Call after a version bump on the DP.",
    operationId: "refreshDataProvider",
    tags:        ["providers"],
    request:     { query: ProviderIdQuerySchema },
    responses: {
        200: { description: "Refreshed",        schema: successEnvelope(DataProviderImportSchema) },
        400: { description: "Missing providerId", schema: HubErrorEnvelope },
        404: { description: "Unknown providerId", schema: HubErrorEnvelope },
        502: { description: "DP unreachable",   schema: HubErrorEnvelope },
    },
};

export default async function handle(req: Request, hub: Hub): Promise<Response> {
    const parsed = ProviderIdQuerySchema.safeParse({ providerId: new URL(req.url).searchParams.get("providerId") });
    if (!parsed.success) {
        return hubErrorResponse(new HubError("validation_error", "missing or malformed `providerId` query param"));
    }
    try {
        return Response.json({ ok: true, data: await refreshDataProvider(hub, parsed.data.providerId) });
    } catch (err) {
        if (err instanceof HubError) return hubErrorResponse(err);
        throw err;
    }
}
