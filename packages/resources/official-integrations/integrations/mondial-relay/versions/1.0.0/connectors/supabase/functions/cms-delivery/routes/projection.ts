import {
    HttpError,
    json,
    limitParam,
    offsetParam,
    readJsonObject,
    requireCmsAdminWriteRequest,
    requireCmsRequest,
    requireCmsWriteRequest,
} from "../http.ts";
import { reconcileDueShipments } from "../shipment/reconciliation.ts";
import {
    acknowledgeShipmentEvent,
    camelizeRecord,
    failShipmentEventProjection,
    markStaleShipmentCreationsUnknown,
    projectionHealth,
    reviewShipmentEventProjection,
    shipmentProjectionExceptionRows,
} from "../shipment/supabase/index.ts";
import { requiredBodyInteger, requiredBodyText } from "./body.ts";

export async function deliveryProjectionHealth(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json(await projectionHealth());
}

export async function reconcile(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const value = Number(body.limit ?? 24);
    const limit = Number.isInteger(value) && value > 0 && value <= 24 ? value : 24;
    const workerId = requiredBodyText(body, "runKey", 200);
    const staleCreations = await markStaleShipmentCreationsUnknown(limit);
    const result = await reconcileDueShipments(limit, workerId);
    return json({
        ...result,
        staleCreations: staleCreations.map((row) => ({
            id: row.id,
            externalOrderId: row.external_order_id,
            status: row.status,
            manualReviewAt: row.creation_manual_review_at,
        })),
    });
}

export async function acknowledgeEvent(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const acknowledged = await acknowledgeShipmentEvent(
        requiredBodyInteger(body, "eventId"),
        requiredBodyText(body, "claimToken", 100),
    );
    if (!acknowledged) {
        throw new HttpError(409, "shipment event projection lease is no longer active");
    }
    return json({ acknowledged: true });
}

export async function failProjectionEvent(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    return json(
        camelizeRecord(
            await failShipmentEventProjection(
                requiredBodyInteger(body, "eventId"),
                requiredBodyText(body, "claimToken", 100),
                requiredBodyText(body, "error", 2000),
            ),
        ),
    );
}

export async function projectionExceptions(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const limit = limitParam(url, 50);
    const offset = offsetParam(url);
    const rows = await shipmentProjectionExceptionRows(limit, offset);
    return json({
        items: rows.map((row) => ({
            id: row.id,
            shipmentId: row.shipment_id,
            externalOrderId: row.order_public_id,
            expeditionNumber: row.expedition_number,
            providerEventId: row.provider_event_key,
            normalizedStatus: row.normalized_status,
            occurredAt: row.occurred_at,
            projectionStatus: row.projection_status,
            projectionAttempts: row.projection_attempts,
            projectionNextAttemptAt: row.projection_next_attempt_at,
            projectionLastError: row.projection_last_error,
            projectionManualReviewAt: row.projection_manual_review_at,
            createdAt: row.created_at,
        })),
        limit,
        offset,
    });
}

export async function reviewProjectionException(request: Request): Promise<Response> {
    requireCmsAdminWriteRequest(request);
    const body = await readJsonObject(request);
    const actorCmsUserId = request.headers.get("x-cms-user-id")?.trim() || "";
    return json(
        camelizeRecord(
            await reviewShipmentEventProjection(
                requiredBodyInteger(body, "eventId"),
                requiredBodyText(body, "action", 50),
                actorCmsUserId,
                requiredBodyText(body, "reason", 1000),
            ),
        ),
    );
}
