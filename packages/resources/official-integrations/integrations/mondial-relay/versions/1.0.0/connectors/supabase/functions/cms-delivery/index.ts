import { createConnectShipment } from "./provider/connect.ts";
import { envDefault, envText, printableAscii } from "./env.ts";
import {
    handleError,
    HttpError,
    isRecord,
    ProviderStatusError,
    json,
    limitParam,
    offsetParam,
    optionsResponse,
    queryText,
    readJsonObject,
    requireCmsAdminWriteRequest,
    requireCmsRequest,
    requireCmsWriteRequest,
    requiredQuery,
    routePath,
} from "./http.ts";
import { issueLabelCapability, shipmentForLabelCapability } from "./shipment/label-access.ts";
import { validatedMondialRelayLabelUrl } from "./provider/label-url.ts";
import { shipmentPayload, stringValue } from "./shipment/payload.ts";
import { trackingSummaryContextByExpedition } from "./shipment/read-contexts.ts";
import { readShipmentTrackingContext } from "./shipment/tracking-context.ts";
import { mondialRelayConnectEndpoint } from "./provider/provider-endpoints.ts";
import { reconcileDueShipments, reconcileShipment, trackingRefreshDue } from "./shipment/reconciliation.ts";
import { requiredBodyInteger, requiredBodyText } from "./routes/body.ts";
import {
    publicDeliveryQuote,
    relayPoints,
    relaySelection,
    resolveDeliveryQuote,
    saveClaimReturnRelaySelection,
    saveRelaySelection,
} from "./routes/relay/index.ts";
import { setSettings, settings, settingsFromRow } from "./routes/settings/routes.ts";
import {
    cancelShipment,
    createShipment,
    issueLabelAccess,
    label,
    recoverShipment,
    sellerHandoff,
    shipment,
    shipmentForExternalOrder,
    shipments,
    systemShipmentTrackingContext,
} from "./routes/shipments/index.ts";
import { publicTrackingEvent, trackingJson } from "./routes/shipments/presentation.ts";
import {
    cancelShipmentReservation,
    declareSellerHandoff,
    recoverUnknownShipment,
} from "./shipment/shipment-operations.ts";
import {
    camelizeRecord,
    acknowledgeShipmentEvent,
    failShipmentEventProjection,
    reserveShipmentCreation,
    settingsRow,
    shipmentEvents,
    shipmentRowByExpedition,
    shipmentWithEventsRowByExpedition,
    shipmentWithEventsRowByExternalOrderId,
    shipmentWithEventsRowById,
    shipmentsRows,
    shipmentProjectionExceptionRows,
    shipmentSelect,
    updateShipment,
    markStaleShipmentCreationsUnknown,
    projectionHealth,
    reviewShipmentEventProjection,
} from "./shipment/supabase.ts";
import type { JsonRecord } from "./shipment/types.ts";

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") {
            return optionsResponse();
        }

        const route = routePath(request);
        if (request.method === "GET" && route === "/health") {
            return health(request);
        }
        if (request.method === "GET" && route === "/shipments") {
            return await shipments(request);
        }
        if (request.method === "GET" && route === "/shipment") {
            return await shipment(request);
        }
        if (request.method === "GET" && route === "/system/shipment-for-external-order") {
            return await shipmentForExternalOrder(request);
        }
        if (request.method === "GET" && route === "/system/shipment-tracking-context") {
            return await systemShipmentTrackingContext(request);
        }
        if (request.method === "POST" && route === "/shipments") {
            return await createShipment(request);
        }
        if (request.method === "GET" && route === "/settings") {
            return await settings(request);
        }
        if (request.method === "POST" && route === "/settings") {
            return await setSettings(request);
        }
        if (request.method === "GET" && route === "/relay-points") {
            return await relayPoints(request);
        }
        if (request.method === "GET" && route === "/relay-selection") {
            return await relaySelection(request);
        }
        if (request.method === "POST" && route === "/relay-selections") {
            return await saveRelaySelection(request);
        }
        if (request.method === "POST" && route === "/system/claim-return-relay-selections") {
            return await saveClaimReturnRelaySelection(request);
        }
        if (request.method === "POST" && route === "/system/delivery-quotes/resolve") {
            return await resolveDeliveryQuote(request);
        }
        if (request.method === "GET" && route === "/system/delivery-quotes/public") {
            return await publicDeliveryQuote(request);
        }
        if (request.method === "GET" && route === "/label") {
            return await label(request);
        }
        if (request.method === "POST" && route === "/system/label-access") {
            return await issueLabelAccess(request);
        }
        if (request.method === "POST" && route === "/system/shipments/handoff") {
            return await sellerHandoff(request);
        }
        if (request.method === "POST" && route === "/system/shipments/cancel") {
            return await cancelShipment(request);
        }
        if (request.method === "POST" && route === "/system/reconcile") {
            return await reconcile(request);
        }
        if (request.method === "POST" && route === "/system/events/ack") {
            return await acknowledgeEvent(request);
        }
        if (request.method === "POST" && route === "/system/events/fail") {
            return await failProjectionEvent(request);
        }
        if (request.method === "GET" && route === "/system/projection-health") {
            return await deliveryProjectionHealth(request);
        }
        if (request.method === "GET" && route === "/admin/projection-exceptions") {
            return await projectionExceptions(request);
        }
        if (request.method === "POST" && route === "/admin/projection-exceptions/review") {
            return await reviewProjectionException(request);
        }
        if (request.method === "POST" && route === "/admin/shipments/recover") {
            return await recoverShipment(request);
        }
        if (request.method === "GET" && route === "/tracking") {
            return await tracking(request);
        }
        if (request.method === "GET" && route === "/parse-tracking-link") {
            return await parseTrackingLink(request);
        }

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

function health(request: Request): Response {
    requireCmsRequest(request);
    const password = envText("MONDIAL_RELAY_CONNECT_PASSWORD");
    return json({
        ok: true,
        mondialRelay: {
            api: "connect-v2",
            endpoint: mondialRelayConnectEndpoint(),
            loginConfigured: envText("MONDIAL_RELAY_CONNECT_LOGIN").length > 0,
            customerId: envText("MONDIAL_RELAY_CONNECT_CUSTOMER_ID"),
            passwordConfigured: password.length > 0,
            passwordLength: password.length,
            passwordPrintableAscii: printableAscii(password),
            widgetBrand: envDefault("MONDIAL_RELAY_WIDGET_BRAND", envText("MONDIAL_RELAY_CONNECT_CUSTOMER_ID")),
            settingsSchema: "delivery",
            settingsTable: "settings",
        },
    });
}

async function deliveryProjectionHealth(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json(await projectionHealth());
}

async function reconcile(request: Request): Promise<Response> {
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

async function acknowledgeEvent(request: Request): Promise<Response> {
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

async function failProjectionEvent(request: Request): Promise<Response> {
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

async function projectionExceptions(request: Request): Promise<Response> {
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

async function reviewProjectionException(request: Request): Promise<Response> {
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

async function tracking(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const expeditionNumber = requiredQuery(url, "expeditionNumber");
    const row = await shipmentRowByExpedition(expeditionNumber);
    if (!row) {
        throw new HttpError(404, "shipment not found");
    }
    if (trackingRefreshDue(row)) {
        const synchronized = await reconcileShipment(row);
        Object.assign(row, {
            status: synchronized.status,
            latest_event_label: synchronized.latestEventLabel ?? row.latest_event_label,
            latest_event_at: synchronized.latestEventAt ?? row.latest_event_at,
            carrier_accepted_at: synchronized.carrierAcceptedAt,
            recipient_handoff_at: synchronized.recipientHandoffAt,
            tracking_checked_at: synchronized.checkedAt,
        });
    }
    const events = await shipmentEvents(String(row.id));
    return json(trackingJson(expeditionNumber, row, events));
}

async function parseTrackingLink(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const link = requiredQuery(url, "url");
    const parsed = parseMondialRelayTrackingLink(link);
    if (!parsed.expeditionNumber) {
        throw new HttpError(400, "unable to extract Mondial Relay expedition number");
    }
    return json({ ...parsed, tracking: await trackingSummary(parsed.expeditionNumber) });
}

async function trackingSummary(expeditionNumber: string): Promise<JsonRecord> {
    const context = await trackingSummaryContextByExpedition(expeditionNumber);
    const row = context.shipment;
    if (!row) {
        return { expeditionNumber, status: "unknown", events: [] };
    }
    return {
        expeditionNumber,
        status: row.status ?? "created",
        latestEventLabel: row.latest_event_label ?? "",
        latestEventAt: row.latest_event_at ?? "",
        events: context.events.map(publicTrackingEvent),
    };
}

function parseMondialRelayTrackingLink(value: string): JsonRecord {
    const url = new URL(value);
    const expeditionNumber =
        url.searchParams.get("numeroExpedition") ??
        url.searchParams.get("expedition") ??
        url.pathname.match(/(\d{8,})/)?.[1] ??
        "";
    const postalCode = url.searchParams.get("codePostal") ?? url.searchParams.get("cp") ?? "";
    return {
        carrier: "mondial-relay",
        expeditionNumber,
        postalCode,
        url: value,
    };
}
