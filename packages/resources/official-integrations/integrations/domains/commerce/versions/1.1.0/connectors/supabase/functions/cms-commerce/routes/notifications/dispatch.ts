import { json } from "../../core/http.ts";
import { readJsonObject } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";
import { boundedInteger, boundedText, notificationMode } from "./values.ts";

export async function claimNotifications(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const payload = await rpc("claim_notifications", {
        p_run_key: boundedText(body.runKey, "runKey", 500),
        p_limit: boundedInteger(body.limit, 10, 1, 50),
        p_consumer_mode: notificationMode(body.consumerMode ?? "builtin", false),
    });
    const rows = Array.isArray(payload) ? payload : [];
    return json({
        items: rows.map((row) => {
            const item = row as Record<string, unknown>;
            return {
                deliveryId: item.delivery_id,
                recipientCmsUserId: item.recipient_cms_user_id,
                templateKey: item.template_key,
                idempotencyKey: item.idempotency_key,
                context: item.context,
            };
        }),
    });
}

export async function completeNotification(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    return json(
        await rpc("complete_notification", {
            p_delivery_id: boundedText(body.deliveryId, "deliveryId", 100),
            p_run_key: boundedText(body.runKey, "runKey", 500),
            p_message_id:
                typeof body.messageId === "string" && body.messageId.trim()
                    ? body.messageId.trim().slice(0, 500)
                    : null,
        }),
    );
}

export async function failNotification(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    return json(
        await rpc("fail_notification", {
            p_delivery_id: boundedText(body.deliveryId, "deliveryId", 100),
            p_run_key: boundedText(body.runKey, "runKey", 500),
            p_error: boundedText(body.error, "error", 2000),
            p_retryable: body.retryable !== false,
        }),
    );
}
