import { cmsUserId } from "../../core/auth.ts";
import { json } from "../../core/http.ts";
import { camelize, integer, readJsonObject, requiredText } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";

export async function cancelMyOrder(request: Request): Promise<Response> {
    return requestCancellation(request, "buyer");
}

export async function cancelMySale(request: Request): Promise<Response> {
    return requestCancellation(request, "seller");
}

export async function reviewOrderCancellation(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("review_order_cancellation", {
        p_request_id: integer(body.cancellationRequestId, "cancellationRequestId", true),
        p_decision: requiredText(body.decision, "decision"),
        p_actor_id: cmsUserId(request),
        p_reason: requiredText(body.reason, "reason"),
    });
    return json(camelize(result));
}

async function requestCancellation(request: Request, actorKind: "buyer" | "seller"): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("request_order_cancellation", {
        p_order_id: integer(body.orderId, "orderId", true),
        p_actor_kind: actorKind,
        p_actor_id: cmsUserId(request),
        p_reason: requiredText(body.reason, "reason"),
    });
    return json(camelize(result), 201);
}
