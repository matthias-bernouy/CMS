import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import { PreflightResultSchema } from "src/core/schemas/preflight";
import { HubErrorEnvelope, successEnvelope } from "src/core/schemas/envelopes";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

export const meta: ApiOperationMeta = {
    summary:     "Deep health check",
    description: "Verifies the hub can authenticate with Keycloak AND that the resulting JWT is accepted as the right role on cms-mt + cdn-origin. Reveals infra info if leaked, hence gated.",
    operationId: "preflight",
    tags:        ["health"],
    responses: {
        200: { description: "All three downstream services reachable + auth OK",         schema: successEnvelope(PreflightResultSchema) },
        503: { description: "At least one downstream service is unreachable / unauth'd", schema: HubErrorEnvelope },
    },
};

export default async function handlePreflight(_req: Request, hub: Hub): Promise<Response> {
    try {
        await hub.init();
        return Response.json({ ok: true, data: { status: "ready" } });
    } catch (err) {
        if (err instanceof HubError) {
            return Response.json({ ok: false, error: { code: err.code, message: err.message } }, { status: 503 });
        }
        throw err;
    }
}
