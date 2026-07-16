import { json } from "../../core/http.ts";
import { camelize, integer, readJsonObject, requiredText, text } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";
import { cmsUserId, requireCmsRole } from "../../core/auth.ts";

export async function recordOrderFulfillment(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("record_order_fulfillment_projection", {
        p_order_public_id: requiredText(body.orderPublicId, "orderPublicId"),
        p_provider_event_id: requiredText(body.providerEventId, "providerEventId"),
        p_normalized_status: requiredText(body.normalizedStatus, "normalizedStatus"),
        p_occurred_at: requiredText(body.occurredAt, "occurredAt"),
        p_provider_reference: text(body.providerReference) ?? null,
        p_recipient_handoff_at: text(body.recipientHandoffAt) ?? null,
        p_carrier_accepted_at: text(body.carrierAcceptedAt) ?? null,
        p_seller_handoff_declared_at: text(body.sellerHandoffDeclaredAt) ?? null,
    });
    return json(camelize(result));
}

export async function getOrderFulfillmentAuthorization(request: Request): Promise<Response> {
    const orderPublicId = requiredText(
        new URL(request.url).searchParams.get("orderPublicId"),
        "orderPublicId",
    );
    const result = await rpc("get_order_fulfillment_authorization", {
        p_order_public_id: orderPublicId,
    });
    return json(camelize(result));
}

export async function reserveOrderShipmentCreation(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("reserve_order_shipment_creation", {
        p_order_public_id: requiredText(body.orderPublicId, "orderPublicId"),
        p_seller_cms_user_id: cmsUserId(request),
        p_worker_id: text(body.workerId) ?? `seller:${cmsUserId(request)}`,
    });
    return json(camelize(result));
}

export async function claimPendingShipmentCreations(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const items = await rpc("claim_pending_shipment_creations", {
        p_worker_id: requiredText(body.runKey, "runKey"),
        p_limit: integer(body.limit, "limit", true) ?? 5,
    });
    return json({ items: camelize(items) });
}

export async function completeOrderShipmentCreation(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("complete_order_shipment_creation", {
        p_operation_id: integer(body.operationId, "operationId", true),
        p_claim_token: requiredText(body.claimToken, "claimToken"),
        p_provider_reference: requiredText(body.providerReference, "providerReference"),
        p_provider_shipment_id: text(body.providerShipmentId) ?? null,
        p_provider_snapshot: typeof body.providerSnapshot === "object" && body.providerSnapshot !== null
            ? body.providerSnapshot : {},
    });
    return json(camelize(result));
}

export async function failOrderShipmentCreation(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("fail_order_shipment_creation", {
        p_operation_id: integer(body.operationId, "operationId", true),
        p_claim_token: requiredText(body.claimToken, "claimToken"),
        p_error: requiredText(body.error, "error"),
        p_unknown: body.unknown === true,
    });
    return json(camelize(result));
}

export async function recoverOrderShipmentCreation(request: Request): Promise<Response> {
    const actorKind = requireCmsRole(request, "support", "finance");
    const body = await readJsonObject(request);
    const result = await rpc("recover_order_shipment_creation", {
        p_order_public_id: requiredText(body.orderPublicId, "orderPublicId"),
        p_provider_reference: requiredText(body.providerReference, "providerReference"),
        p_provider_shipment_id: requiredText(body.providerShipmentId, "providerShipmentId"),
        p_provider_snapshot: typeof body.providerSnapshot === "object" && body.providerSnapshot !== null
            ? body.providerSnapshot : {},
        p_actor_kind: actorKind,
        p_actor_id: cmsUserId(request),
        p_reason: requiredText(body.reason, "reason"),
    });
    return json(camelize(result));
}

export async function getOrderLabelAuthorization(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const result = await rpc("get_order_label_authorization", {
        p_order_public_id: requiredText(url.searchParams.get("orderPublicId"), "orderPublicId"),
        p_seller_cms_user_id: cmsUserId(request),
    });
    return json(camelize(result));
}

export async function claimPendingShipmentCancellations(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const items = await rpc("claim_pending_shipment_cancellations", {
        p_worker_id: requiredText(body.runKey, "runKey"),
        p_limit: integer(body.limit, "limit", true) ?? 5,
    });
    return json({ items: camelize(items) });
}

export async function completeOrderShipmentCancellation(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("complete_order_shipment_cancellation", {
        p_operation_id: integer(body.operationId, "operationId", true),
        p_claim_token: requiredText(body.claimToken, "claimToken"),
        p_provider_status: requiredText(body.providerStatus, "providerStatus"),
        p_provider_reference: text(body.providerReference) ?? null,
        p_provider_snapshot: typeof body.providerSnapshot === "object" && body.providerSnapshot !== null
            ? body.providerSnapshot : {},
    });
    return json(camelize(result));
}

export async function failOrderShipmentCancellation(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("fail_order_shipment_cancellation", {
        p_operation_id: integer(body.operationId, "operationId", true),
        p_claim_token: requiredText(body.claimToken, "claimToken"),
        p_error: requiredText(body.error, "error"),
    });
    return json(camelize(result));
}

export async function recordDeliveryReconciliationHealth(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("record_delivery_reconciliation_health", {
        p_run_key: requiredText(body.runKey, "runKey"),
        p_checked_at: requiredText(body.checkedAt, "checkedAt"),
        p_pending_projection_count: integer(body.pendingProjectionCount, "pendingProjectionCount", true),
        p_manual_review_count: integer(body.manualReviewCount, "manualReviewCount", true),
        p_tracking_error_count: integer(body.trackingErrorCount, "trackingErrorCount", true),
    });
    return json(camelize(result));
}

export async function recordDeliveryOrderReconciliationHealth(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("record_delivery_order_reconciliation_health", {
        p_run_key: requiredText(body.runKey, "runKey"),
        p_checked_at: requiredText(body.checkedAt, "checkedAt"),
        p_order_public_id: requiredText(body.orderPublicId, "orderPublicId"),
        p_shipment_id: requiredText(body.shipmentId, "shipmentId"),
        p_provider_reference: text(body.providerReference) ?? null,
        p_shipment_status: requiredText(body.shipmentStatus, "shipmentStatus"),
        p_pending_projection_count: integer(body.pendingProjectionCount, "pendingProjectionCount", true),
        p_manual_review_count: integer(body.manualReviewCount, "manualReviewCount", true),
        p_tracking_error_count: integer(body.trackingErrorCount, "trackingErrorCount", true),
        p_tracking_checked_at: text(body.trackingCheckedAt) ?? null,
    });
    return json(camelize(result));
}
