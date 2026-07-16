import { cmsUserId } from "../../core/auth.ts";
import { json } from "../../core/http.ts";
import { camelize, integer, readJsonObject, text } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";

export async function authorizeOrderRelease(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("authorize_order_release", {
        p_order_id: integer(body.orderId, "orderId", true),
        p_actor_kind: "admin",
        p_actor_id: cmsUserId(request),
        p_reason: text(body.reason) ?? null,
        p_expected_settlement_version: integer(
            body.expectedSettlementVersion,
            "expectedSettlementVersion",
            true,
        ),
    });
    return json(camelize(result));
}
