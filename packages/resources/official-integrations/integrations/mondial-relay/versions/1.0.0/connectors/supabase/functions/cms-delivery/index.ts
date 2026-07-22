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

async function shipments(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const limit = limitParam(url, 50);
    const offset = offsetParam(url);
    const filters = [
        `select=${encodeURIComponent(shipmentSelect())}`,
        `order=${encodeURIComponent("created_at.desc")}`,
        `limit=${limit}`,
        `offset=${offset}`,
    ];
    appendEqualFilter(filters, "status", queryText(url, "status"));
    appendEqualFilter(filters, "external_order_id", queryText(url, "externalOrderId"));
    const q = queryText(url, "q");
    if (q) {
        const value = q.replace(/[,*()]/g, " ").trim();
        if (value) {
            filters.push(
                `or=${encodeURIComponent(
                    [
                        `recipient_name.ilike.*${value}*`,
                        `recipient_city.ilike.*${value}*`,
                        `expedition_number.ilike.*${value}*`,
                        `external_order_id.ilike.*${value}*`,
                    ].join(","),
                )}`,
            );
        }
    }
    const rows = await shipmentsRows(filters.join("&"));
    return json({ items: rows.map(toShipmentJson), limit, offset });
}

async function shipment(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const row = await shipmentWithEventsByRequest(url);
    if (!row) {
        throw new HttpError(404, "shipment not found");
    }
    return json(shipmentDetailJson(row));
}

async function shipmentForExternalOrder(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const externalOrderId = requiredQuery(new URL(request.url), "externalOrderId");
    const row = await shipmentWithEventsRowByExternalOrderId(externalOrderId);
    return json({ items: row ? [shipmentTrackingJson(row)] : [] });
}

async function systemShipmentTrackingContext(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const expeditionNumber = requiredQuery(url, "expeditionNumber");
    const expectedExternalOrderId = requiredQuery(url, "expectedExternalOrderId");
    const context = await readShipmentTrackingContext(expeditionNumber, expectedExternalOrderId);
    return json({
        shipment: shipmentDetailJson(context.shipment),
        tracking: trackingJson(expeditionNumber, context.tracking, context.events),
    });
}

async function createShipment(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const payload = shipmentPayload(body, settingsFromRow(await settingsRow()));
    const deliveryQuoteId = stringValue(body.deliveryQuoteId);
    const sellerCmsUserId = stringValue(body.sellerCmsUserId);
    if (!sellerCmsUserId) {
        throw new HttpError(400, "sellerCmsUserId is required");
    }
    const quotePurpose = stringValue(body.quotePurpose) || "fulfillment";
    const quoteExternalOrderId = stringValue(body.quoteExternalOrderId) || payload.externalOrderId;
    const selectedForCmsUserId = stringValue(body.selectedForCmsUserId);
    const idempotencyKey = payload.externalOrderId || payload.id;
    const observedAt = new Date().toISOString();
    const reservation = {
        id: payload.id,
        external_order_id: payload.externalOrderId || undefined,
        idempotency_key: idempotencyKey,
        status: "creating",
        provider_call_started_at: observedAt,
        creation_manual_review_at: null,
        seller_cms_user_id: sellerCmsUserId,
        delivery_quote_id: deliveryQuoteId || undefined,
        label_format: payload.connectOutputFormat,
        mode_collection: payload.modeCollection,
        mode_delivery: payload.modeDelivery,
        delivery_relay_country: payload.deliveryRelayCountry,
        delivery_relay_number: payload.deliveryRelayLocation,
        sender_name: payload.sender.name,
        sender_email: payload.sender.email || undefined,
        sender_phone: payload.sender.phone || payload.sender.mobile || undefined,
        sender_address_line1: payload.sender.addressLine1,
        sender_address_line2: payload.sender.addressLine2 || undefined,
        sender_address_line3: payload.sender.addressLine3 || undefined,
        sender_postal_code: payload.sender.postalCode,
        sender_city: payload.sender.city,
        sender_country: payload.sender.country,
        recipient_name: payload.recipient.name,
        recipient_email: payload.recipient.email || undefined,
        recipient_phone: payload.recipient.phone || payload.recipient.mobile || undefined,
        recipient_address_line1: payload.recipient.addressLine1,
        recipient_address_line2: payload.recipient.addressLine2 || undefined,
        recipient_address_line3: payload.recipient.addressLine3 || undefined,
        recipient_postal_code: payload.recipient.postalCode,
        recipient_city: payload.recipient.city,
        recipient_country: payload.recipient.country,
        weight_grams: payload.weightGrams,
        declared_value_minor_amount: payload.declaredValueMinorAmount,
        declared_currency: payload.declaredCurrency,
        package_count: payload.packageCount,
        length_cm: payload.lengthCm,
        instructions: payload.instructions || undefined,
        metadata: payload.metadata,
        raw_request: payload.raw,
        raw_response: {},
        created_by: request.headers.get("x-cms-user-id")?.trim() || undefined,
    };
    const result = await reserveShipmentCreation({
        reservation,
        quoteCheck: {
            externalOrderId: payload.externalOrderId,
            deliveryRelayLocation: payload.deliveryRelayLocation,
            weightGrams: payload.weightGrams,
            declaredValueMinorAmount: payload.declaredValueMinorAmount,
            declaredCurrency: payload.declaredCurrency,
            sender: payload.sender,
            recipient: payload.recipient,
        },
        quotePurpose,
        quoteExternalOrderId,
        selectedForCmsUserId,
        observedAt,
    });
    const row = isRecord(result.shipment) ? result.shipment : null;
    if (!row) {
        throw new HttpError(409, "shipment creation reservation was not acquired");
    }
    if (result.outcome === "replay") {
        return shipmentReplayResponse(row);
    }
    if (result.outcome === "creating") {
        return await existingCreatingShipmentResponse(row);
    }
    if (result.outcome === "unknown") {
        throw new HttpError(409, "shipment creation outcome is unknown and requires reconciliation");
    }
    if (result.outcome !== "provider_required") {
        throw new HttpError(409, "shipment creation reservation was not acquired");
    }

    try {
        const result = await createConnectShipment(payload);
        const completed = await updateShipment(
            String(row.id),
            {
                expedition_number: result.expeditionNumber,
                tracking_number: result.expeditionNumber,
                status: result.labelUrl ? "label_ready" : "created",
                last_error: null,
                label_url: result.labelUrl || null,
                tracking_url: trackingUrl(result.expeditionNumber, payload.recipient.postalCode),
                raw_response: result.raw,
            },
            "creating",
        );
        if (!completed) {
            throw new HttpError(409, "shipment creation reservation is no longer active");
        }

        return json(
            {
                ok: true,
                id: completed.id,
                expeditionNumber: result.expeditionNumber,
                trackingUrl: completed.tracking_url,
                status: completed.status,
                createdAt: completed.created_at,
            },
            201,
        );
    } catch (error) {
        const retrySafe = error instanceof ProviderStatusError && error.provider.retrySafe === true;
        await updateShipment(
            String(row.id),
            {
                status: retrySafe ? "failed" : "unknown",
                last_error: error instanceof Error ? error.message : "shipment creation failed",
            },
            "creating",
        ).catch(() => null);
        throw error;
    }
}

function shipmentReplayResponse(row: JsonRecord): Response {
    return json({
        ok: true,
        id: row.id,
        expeditionNumber: row.expedition_number,
        trackingUrl: row.tracking_url,
        status: row.status,
        createdAt: row.created_at,
        idempotentReplay: true,
    });
}

async function existingCreatingShipmentResponse(row: JsonRecord): Promise<Response> {
    const startedAt = Date.parse(String(row.provider_call_started_at ?? ""));
    if (Number.isFinite(startedAt) && Date.now() - startedAt >= 20 * 60_000) {
        await updateShipment(
            String(row.id),
            {
                status: "unknown",
                creation_manual_review_at: new Date().toISOString(),
                last_error: "shipment creation lease expired before a provider outcome was attached",
            },
            "creating",
        ).catch(() => null);
        throw new HttpError(409, "shipment creation outcome is unknown and requires administrator recovery");
    }
    throw new HttpError(409, "shipment creation is already in progress");
}

async function label(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const token = requiredQuery(url, "token");
    const sellerCmsUserId = request.headers.get("x-cms-user-id")?.trim() || "";
    const row = await shipmentForLabelCapability(token, sellerCmsUserId);
    const labelUrl = typeof row?.label_url === "string" ? row.label_url : "";
    if (!labelUrl) {
        throw new HttpError(404, "label not found");
    }
    const providerUrl = validatedMondialRelayLabelUrl(labelUrl);
    const upstream = await fetch(providerUrl, { redirect: "manual" });
    if (upstream.status >= 300 && upstream.status < 400) {
        throw new HttpError(502, "Mondial Relay label redirects are not allowed");
    }
    if (!upstream.ok || !upstream.body) {
        throw new HttpError(502, "unable to fetch Mondial Relay label");
    }
    const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("application/pdf")) {
        throw new HttpError(502, "Mondial Relay label response is not a PDF");
    }
    return new Response(upstream.body, {
        status: 200,
        headers: {
            "content-type": "application/pdf",
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            "content-disposition": `attachment; filename="mondial-relay-${String(row.expedition_number)}.pdf"`,
        },
    });
}

async function issueLabelAccess(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const externalOrderId = requiredBodyText(body, "externalOrderId", 200);
    const sellerCmsUserId = requiredBodyText(body, "sellerCmsUserId", 200);
    return json(await issueLabelCapability(externalOrderId, sellerCmsUserId), 201);
}

async function sellerHandoff(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    return json(
        await declareSellerHandoff(
            requiredBodyText(body, "externalOrderId", 200),
            request.headers.get("x-cms-user-id")?.trim() || "",
        ),
    );
}

async function cancelShipment(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    return json(
        await cancelShipmentReservation(
            requiredBodyText(body, "externalOrderId", 200),
            requiredBodyText(body, "trackingUntil", 100),
        ),
    );
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

async function recoverShipment(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const actorCmsUserId = request.headers.get("x-cms-user-id")?.trim() || "";
    return json(
        await recoverUnknownShipment(
            requiredBodyText(body, "shipmentId", 100),
            requiredBodyText(body, "externalOrderId", 200),
            requiredBodyText(body, "expeditionNumber", 8),
            stringValue(body.labelUrl),
            actorCmsUserId,
            requiredBodyText(body, "reason", 1000),
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

function trackingJson(expeditionNumber: string, row: JsonRecord, events: JsonRecord[]): JsonRecord {
    return {
        expeditionNumber,
        status: row.status ?? "created",
        latestEventLabel: row.latest_event_label ?? "",
        latestEventAt: row.latest_event_at ?? "",
        carrierAcceptedAt: row.carrier_accepted_at ?? "",
        recipientHandoffAt: row.recipient_handoff_at ?? "",
        events: events.map(publicTrackingEvent),
    };
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

function publicTrackingEvent(row: JsonRecord): JsonRecord {
    return {
        normalizedStatus: row.normalized_status,
        occurredAt: row.occurred_at,
        eventLabel: row.event_label,
        eventDate: row.event_date,
        eventTime: row.event_time,
        location: row.location,
    };
}

function shipmentDetailJson(row: JsonRecord): JsonRecord {
    const events = Array.isArray(row.events) ? row.events.filter(isRecord) : [];
    return {
        ...toShipmentJson(row),
        events: events.map(publicTrackingEvent),
    };
}

function shipmentTrackingJson(row: JsonRecord): JsonRecord {
    const detail = shipmentDetailJson(row);
    return {
        id: detail.id,
        expeditionNumber: detail.expeditionNumber,
        status: detail.status,
        trackingUrl: detail.trackingUrl,
        deliveryRelayLocation: detail.deliveryRelayLocation,
        latestEventLabel: detail.latestEventLabel,
        latestEventAt: detail.latestEventAt,
        carrierAcceptedAt: detail.carrierAcceptedAt,
        sellerHandoffDeclaredAt: detail.sellerHandoffDeclaredAt,
        recipientHandoffAt: detail.recipientHandoffAt,
        createdAt: detail.createdAt,
        events: detail.events,
    };
}

function toShipmentJson(row: JsonRecord): JsonRecord {
    const out = camelizeRecord(row);
    if (typeof out.deliveryRelayNumber === "string") {
        out.deliveryRelayLocation = out.deliveryRelayNumber;
    }
    return out;
}

async function shipmentWithEventsByRequest(url: URL): Promise<JsonRecord | null> {
    const id = queryText(url, "id");
    if (id) {
        return await shipmentWithEventsRowById(id);
    }
    const expeditionNumber = queryText(url, "expeditionNumber");
    if (expeditionNumber) {
        return await shipmentWithEventsRowByExpedition(expeditionNumber);
    }
    throw new HttpError(400, "id or expeditionNumber is required");
}

function appendEqualFilter(filters: string[], name: string, value: string | undefined): void {
    if (value) {
        filters.push(`${name}=eq.${encodeURIComponent(value)}`);
    }
}

function trackingUrl(expeditionNumber: string, postalCode: string): string {
    const url = new URL("https://www.mondialrelay.fr/suivi-de-colis/");
    url.searchParams.set("numeroExpedition", expeditionNumber);
    if (postalCode) {
        url.searchParams.set("codePostal", postalCode);
    }
    return url.toString();
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
