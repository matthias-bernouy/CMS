import { callRpcObject } from "../../db/postgrest.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import { assertAllowedKeys, readJsonObject, requiredInteger, requiredString } from "../../http/body/index.ts";
import { json } from "../../http/responses.ts";
import type { JsonRecord } from "../../shared/types.ts";

export async function acknowledgeCommerceProjection(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["projectionId", "claimToken"]);
    const result = await callRpcObject<JsonRecord>("ack_commerce_projection_outbox", {
        p_projection_id: requiredInteger(body, "projectionId"),
        p_claim_token: requiredString(body, "claimToken", 100),
    });
    return json({ acknowledged: true, projectionId: result.id });
}

export async function failCommerceProjection(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["projectionId", "claimToken", "error"]);
    const result = await callRpcObject<JsonRecord>("fail_commerce_projection_outbox", {
        p_projection_id: requiredInteger(body, "projectionId"),
        p_claim_token: requiredString(body, "claimToken", 100),
        p_error: requiredString(body, "error", 2000),
    });
    return json({
        failed: true,
        projectionId: result.id,
        status: result.projection_status,
        nextAttemptAt: result.next_attempt_at,
    });
}
