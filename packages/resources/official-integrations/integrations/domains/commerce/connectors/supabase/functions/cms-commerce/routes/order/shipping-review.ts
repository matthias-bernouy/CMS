import { cmsUserId } from "../../core/auth.ts";
import { json } from "../../core/http.ts";
import { readJsonObject, requiredText } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";

export async function reopenOrderShippingWindow(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("reopen_order_shipping_window", {
        p_order_public_id: requiredText(body.orderPublicId, "orderPublicId"),
        p_actor_id: cmsUserId(request),
        p_reason: requiredText(body.reason, "reason"),
    });
    return json(result);
}
