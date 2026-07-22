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
import { normalizePhone, shipmentPayload, stringValue } from "./shipment/payload.ts";
import {
    readRelaySelectionContext,
    readRelaySelectionSetupContext,
    trackingSummaryContextByExpedition,
} from "./shipment/read-contexts.ts";
import { readShipmentTrackingContext } from "./shipment/tracking-context.ts";
import { mondialRelayConnectEndpoint } from "./provider/provider-endpoints.ts";
import { reconcileDueShipments, reconcileShipment, trackingRefreshDue } from "./shipment/reconciliation.ts";
import { relayPointsFromUrl } from "./provider/relay.ts";
import {
    cancelShipmentReservation,
    declareSellerHandoff,
    recoverUnknownShipment,
} from "./shipment/shipment-operations.ts";
import {
    camelizeRecord,
    acknowledgeShipmentEvent,
    failShipmentEventProjection,
    deliveryQuoteRow,
    reserveShipmentCreation,
    settingsRow,
    upsertSettingsRow,
    shipmentEvents,
    shipmentRowByExpedition,
    shipmentWithEventsRowByExpedition,
    shipmentWithEventsRowByExternalOrderId,
    shipmentWithEventsRowById,
    shipmentsRows,
    shipmentProjectionExceptionRows,
    shipmentSelect,
    updateShipment,
    upsertRelaySelectionRow,
    reserveDeliveryQuote,
    markStaleShipmentCreationsUnknown,
    projectionHealth,
    reviewShipmentEventProjection,
} from "./shipment/supabase.ts";
import type { DeliverySettings, JsonRecord } from "./shipment/types.ts";

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

async function settings(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const id = queryText(url, "id");
    const row = await settingsRow(id || "default");
    const settings = settingsJson(row);
    if (id) {
        return json(settings);
    }
    return json({ items: [settings] });
}

async function setSettings(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const patch = settingsRowFromBody(body);
    if (!Object.keys(patch).length) {
        throw new HttpError(400, "settings payload is empty");
    }
    const row = await upsertSettingsRow(patch);
    return json(settingsJson(row));
}

async function relayPoints(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const [items, deliverySettings] = await Promise.all([
        relayPointsFromUrl(new URL(request.url)),
        settingsRow().then(settingsFromRow),
    ]);
    return json({
        items: items.map((item) => ({
            ...item,
            shippingAmount: deliverySettings.defaultShippingAmount,
            currency: deliverySettings.declaredCurrency.toLowerCase(),
        })),
    });
}

async function relaySelection(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const externalOrderId = requiredQuery(new URL(request.url), "externalOrderId");
    const selectedForCmsUserId = request.headers.get("x-cms-user-id")?.trim() || "";
    const context = await readRelaySelectionContext(externalOrderId, selectedForCmsUserId);
    if (context.outcome === "selection") {
        return json(relaySelectionJson(context.row));
    }
    if (context.outcome === "quote") {
        return json(deliveryQuoteJson(context.row));
    }
    throw new HttpError(404, "no pickup point is saved for this order");
}

async function saveRelaySelection(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const selectedBy = request.headers.get("x-cms-user-id")?.trim() || "";
    if (!selectedBy) {
        throw new HttpError(401, "CMS user is missing");
    }
    const body = await readJsonObject(request);
    const requestKey = requiredBodyText(body, "requestKey", 500);
    const externalOrderId = requiredBodyText(body, "externalOrderId", 200);
    const validation = captureValidation(() => {
        const relayLocation = requiredBodyText(body, "relayLocation", 23).toUpperCase();
        const selectedForCmsUserId = requiredBodyText(body, "selectedForCmsUserId", 512);
        if (selectedForCmsUserId !== selectedBy) {
            throw new HttpError(403, "delivery quote belongs to another buyer");
        }
        const orderVersion = requiredBodyInteger(body, "orderVersion");
        const merchandiseSubtotalMinorAmount = requiredMinorAmount(
            body.merchandiseSubtotalMinorAmount,
            "merchandiseSubtotalMinorAmount",
        );
        const orderCurrency = requiredBodyText(body, "currency", 3).toLowerCase();
        if (orderCurrency !== "eur") {
            throw new HttpError(400, "protected Mondial Relay quotes support EUR only");
        }
        return {
            relayLocation,
            selectedForCmsUserId,
            orderVersion,
            merchandiseSubtotalMinorAmount,
            orderCurrency,
            recipientSnapshot: fulfillmentAddressSnapshot(body.recipientSnapshot, "recipient", false),
            sellerFulfillmentSnapshot: fulfillmentAddressSnapshot(body.sellerFulfillmentSnapshot, "seller", true),
            country: (stringValue(body.country) || "FR").toUpperCase(),
            postalCode: requiredBodyText(body, "postalCode", 20),
            city: stringValue(body.city).slice(0, 120),
        };
    });
    const setup = await readRelaySelectionSetupContext(externalOrderId, validation.ok);
    if (setup.outcome === "shipment_exists") {
        throw new HttpError(409, "relay selection cannot change after shipment creation has started");
    }
    if (!validation.ok) {
        throw validation.error;
    }
    const {
        relayLocation,
        selectedForCmsUserId,
        orderVersion,
        merchandiseSubtotalMinorAmount,
        orderCurrency,
        recipientSnapshot,
        sellerFulfillmentSnapshot,
        country,
        postalCode,
        city,
    } = validation.value;
    const deliverySettings = settingsFromRow(setup.settings);
    const weightGrams = deliverySettings.defaultWeightGrams;
    if (!/^[A-Z]{2}-[A-Z0-9]{1,20}$/.test(relayLocation)) {
        throw new HttpError(400, "pickup point identifier is invalid");
    }
    if (country !== "FR") {
        throw new HttpError(400, "only French pickup points are supported");
    }

    const lookupUrl = new URL("https://cms-delivery.local/relay-points");
    lookupUrl.searchParams.set("country", country);
    lookupUrl.searchParams.set("postalCode", postalCode);
    if (city) {
        lookupUrl.searchParams.set("city", city);
    }
    lookupUrl.searchParams.set("weightGrams", String(weightGrams));
    lookupUrl.searchParams.set("limit", "8");
    const point = (await relayPointsFromUrl(lookupUrl)).find(
        (item) => item.location === relayLocation && item.pointType === "relay_point",
    );
    if (!point) {
        throw new HttpError(409, "the selected pickup point is unavailable or does not match the search area");
    }

    const requestSnapshot = {
        requestKey,
        externalOrderId,
        orderVersion,
        selectedForCmsUserId,
        relayLocation,
        country,
        postalCode,
        city,
        merchandiseSubtotalMinorAmount,
        currency: orderCurrency,
        recipientSnapshot,
        sellerFulfillmentSnapshot,
    };
    const quoteId = `mrq_${await sha256Hex(requestKey)}`;
    const row = await reserveDeliveryQuote({
        p_quote_id: quoteId,
        p_request_key: requestKey,
        p_external_order_id: externalOrderId,
        p_order_version: orderVersion,
        p_selected_by: selectedBy,
        p_selected_for_cms_user_id: selectedForCmsUserId,
        p_relay_location: point.location,
        p_relay_country: point.country,
        p_relay_number: point.number,
        p_relay_name: point.name,
        p_relay_address_line1: point.addressLine1,
        p_relay_address_line2: point.addressLine2,
        p_relay_postal_code: point.postalCode,
        p_relay_city: point.city,
        p_relay_latitude: point.latitude,
        p_relay_longitude: point.longitude,
        p_weight_grams: weightGrams,
        p_shipping_amount: deliverySettings.defaultShippingAmount,
        p_currency: orderCurrency,
        p_merchandise_subtotal_minor_amount: merchandiseSubtotalMinorAmount,
        p_recipient_snapshot: recipientSnapshot,
        p_seller_fulfillment_snapshot: sellerFulfillmentSnapshot,
        p_relay_snapshot: point,
        p_request_snapshot: requestSnapshot,
        p_ttl_seconds: 900,
    });
    return json(deliveryQuoteJson(row));
}

async function saveClaimReturnRelaySelection(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const selectedBy = request.headers.get("x-cms-user-id")?.trim() || "";
    if (!selectedBy) {
        throw new HttpError(401, "CMS user is missing");
    }
    const body = await readJsonObject(request);
    const externalOrderId = requiredBodyText(body, "externalOrderId", 200);
    if (!/^claim-return:[1-9][0-9]*$/.test(externalOrderId)) {
        throw new HttpError(400, "legacy relay selection is restricted to claim returns");
    }
    const validation = captureValidation(() => ({
        relayLocation: requiredBodyText(body, "relayLocation", 23).toUpperCase(),
        country: (stringValue(body.country) || "FR").toUpperCase(),
        postalCode: requiredBodyText(body, "postalCode", 20),
        city: stringValue(body.city).slice(0, 120),
    }));
    const setup = await readRelaySelectionSetupContext(externalOrderId, validation.ok);
    if (setup.outcome === "shipment_exists") {
        throw new HttpError(409, "relay selection cannot change after shipment creation has started");
    }
    if (!validation.ok) {
        throw validation.error;
    }
    const { relayLocation, country, postalCode, city } = validation.value;
    const deliverySettings = settingsFromRow(setup.settings);
    if (!/^[A-Z]{2}-[A-Z0-9]{1,20}$/.test(relayLocation) || country !== "FR") {
        throw new HttpError(400, "claim return pickup point is invalid");
    }
    const lookupUrl = new URL("https://cms-delivery.local/relay-points");
    lookupUrl.searchParams.set("country", country);
    lookupUrl.searchParams.set("postalCode", postalCode);
    if (city) {
        lookupUrl.searchParams.set("city", city);
    }
    lookupUrl.searchParams.set("weightGrams", String(deliverySettings.defaultWeightGrams));
    lookupUrl.searchParams.set("limit", "8");
    const point = (await relayPointsFromUrl(lookupUrl)).find(
        (item) => item.location === relayLocation && item.pointType === "relay_point",
    );
    if (!point) {
        throw new HttpError(409, "the selected pickup point is unavailable or does not match the search area");
    }
    const row = await upsertRelaySelectionRow({
        external_order_id: externalOrderId,
        relay_location: point.location,
        relay_country: point.country,
        relay_number: point.number,
        relay_name: point.name,
        address_line1: point.addressLine1,
        address_line2: point.addressLine2,
        postal_code: point.postalCode,
        city: point.city,
        latitude: point.latitude,
        longitude: point.longitude,
        weight_grams: deliverySettings.defaultWeightGrams,
        shipping_amount: deliverySettings.defaultShippingAmount,
        currency: deliverySettings.declaredCurrency.toLowerCase(),
        selected_by: selectedBy,
        snapshot: point,
    });
    return json(relaySelectionJson(row));
}

async function resolveDeliveryQuote(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const quoteId = requiredBodyText(body, "quoteId", 80);
    const externalOrderId = requiredBodyText(body, "externalOrderId", 200);
    const selectedForCmsUserId = requiredBodyText(body, "selectedForCmsUserId", 512);
    const row = await deliveryQuoteRow(quoteId);
    if (!row || row.external_order_id !== externalOrderId || row.selected_for_cms_user_id !== selectedForCmsUserId) {
        throw new HttpError(404, "delivery quote not found for the exact order and buyer");
    }
    const expectedOrderVersion = optionalPositiveInteger(body.orderVersion, "orderVersion");
    if (expectedOrderVersion !== null && row.order_version !== expectedOrderVersion) {
        throw new HttpError(409, "delivery quote order version mismatch");
    }
    const expectedMerchandise = optionalMinorAmount(
        body.merchandiseSubtotalMinorAmount,
        "merchandiseSubtotalMinorAmount",
    );
    if (expectedMerchandise !== null && row.merchandise_subtotal_minor_amount !== expectedMerchandise) {
        throw new HttpError(409, "delivery quote merchandise value mismatch");
    }
    const expectedCurrency = stringValue(body.currency).toLowerCase();
    if (expectedCurrency && row.currency !== expectedCurrency) {
        throw new HttpError(409, "delivery quote currency mismatch");
    }
    const purpose = stringValue(body.purpose) || "fulfillment";
    if (purpose === "financial_lock" && Date.parse(String(row.expires_at)) <= Date.now()) {
        throw new HttpError(409, "delivery quote expired before financial terms were locked");
    }
    if (!["financial_lock", "fulfillment", "claim_return"].includes(purpose)) {
        throw new HttpError(400, "delivery quote purpose is invalid");
    }
    return json({
        ...deliveryQuoteJson(row),
        recipientSnapshot: row.recipient_snapshot,
        sellerFulfillmentSnapshot: row.seller_fulfillment_snapshot,
    });
}

async function publicDeliveryQuote(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const quoteId = requiredQuery(url, "quoteId");
    const externalOrderId = requiredQuery(url, "externalOrderId");
    const selectedForCmsUserId = requiredQuery(url, "selectedForCmsUserId");
    const row = await deliveryQuoteRow(quoteId);
    if (!row || row.external_order_id !== externalOrderId || row.selected_for_cms_user_id !== selectedForCmsUserId) {
        throw new HttpError(404, "delivery quote not found for the exact order and buyer");
    }
    return json(deliveryQuoteJson(row));
}

function deliveryQuoteJson(row: JsonRecord): JsonRecord {
    return {
        quoteId: row.quote_id,
        externalOrderId: row.external_order_id,
        orderVersion: row.order_version,
        revision: row.revision,
        selectedForCmsUserId: row.selected_for_cms_user_id,
        relayLocation: row.relay_location,
        country: row.relay_country,
        number: row.relay_number,
        name: row.relay_name,
        addressLine1: row.relay_address_line1,
        addressLine2: row.relay_address_line2,
        postalCode: row.relay_postal_code,
        city: row.relay_city,
        latitude: row.relay_latitude,
        longitude: row.relay_longitude,
        nature: relaySnapshotText(row, "relay_snapshot", "nature"),
        pointType: relaySnapshotPointType(row, "relay_snapshot"),
        weightGrams: row.weight_grams,
        shippingAmount: row.shipping_amount,
        currency: row.currency,
        merchandiseSubtotalMinorAmount: row.merchandise_subtotal_minor_amount,
        quotedAt: row.quoted_at,
        expiresAt: row.expires_at,
    };
}

function relaySelectionJson(row: JsonRecord): JsonRecord {
    return {
        externalOrderId: row.external_order_id,
        relayLocation: row.relay_location,
        country: row.relay_country,
        number: row.relay_number,
        name: row.relay_name,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2,
        postalCode: row.postal_code,
        city: row.city,
        latitude: row.latitude,
        longitude: row.longitude,
        nature: relaySnapshotText(row, "snapshot", "nature"),
        pointType: relaySnapshotPointType(row, "snapshot"),
        weightGrams: row.weight_grams,
        shippingAmount: row.shipping_amount,
        currency: row.currency,
        selectedAt: row.updated_at ?? row.created_at,
    };
}

function relaySnapshotText(row: JsonRecord, snapshotKey: string, field: string): string {
    const snapshot = row[snapshotKey];
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        return "";
    }
    return stringValue((snapshot as JsonRecord)[field]);
}

function relaySnapshotPointType(row: JsonRecord, snapshotKey: string): string {
    const pointType = relaySnapshotText(row, snapshotKey, "pointType");
    if (pointType) {
        return pointType;
    }
    const nature = relaySnapshotText(row, snapshotKey, "nature").toUpperCase();
    return nature ? (nature === "C" ? "locker" : "relay_point") : "";
}

function requiredBodyText(body: JsonRecord, name: string, maxLength: number): string {
    const value = stringValue(body[name]);
    if (!value) {
        throw new HttpError(400, `${name} is required`);
    }
    if (value.length > maxLength) {
        throw new HttpError(400, `${name} is too long`);
    }
    return value;
}

function captureValidation<T>(validate: () => T): { ok: true; value: T } | { ok: false; error: unknown } {
    try {
        return { ok: true, value: validate() };
    } catch (error) {
        return { ok: false, error };
    }
}

function requiredMinorAmount(value: unknown, name: string): number {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 999_999_999) {
        throw new HttpError(400, `${name} must be an integer between 0 and 999999999 minor units`);
    }
    return amount;
}

function optionalMinorAmount(value: unknown, name: string): number | null {
    return value === undefined || value === null || value === "" ? null : requiredMinorAmount(value, name);
}

function optionalPositiveInteger(value: unknown, name: string): number | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const integer = Number(value);
    if (!Number.isSafeInteger(integer) || integer < 1) {
        throw new HttpError(400, `${name} must be a positive integer`);
    }
    return integer;
}

function fulfillmentAddressSnapshot(value: unknown, label: "recipient" | "seller", seller: boolean): JsonRecord {
    if (!isRecord(value)) {
        throw new HttpError(400, `${label} fulfillment profile is required`);
    }
    const firstName = stringValue(value.givenName) || stringValue(value.firstName);
    const lastName = stringValue(value.surname) || stringValue(value.lastName);
    const explicitName = seller ? stringValue(value.name) : stringValue(value.recipient) || stringValue(value.name);
    const name = explicitName || `${firstName} ${lastName}`.trim();
    const phone = normalizePhone(stringValue(value.phone), "FR");
    const addressLine1 = stringValue(value.addressLine1);
    const addressLine2 = stringValue(value.addressLine2);
    const addressLine3 = stringValue(value.addressLine3);
    const postalCode = stringValue(value.postalCode);
    const city = stringValue(value.city);
    const country = stringValue(value.countryCode ?? value.country).toUpperCase();
    if (!name || !phone || !addressLine1 || !postalCode || !city || country !== "FR") {
        throw new HttpError(409, `${label} fulfillment profile is incomplete or outside France`);
    }
    if (!/^\+33[1-9]\d{8}$/.test(phone)) {
        throw new HttpError(409, `${label} phone must be a valid French E.164 number`);
    }
    if (!/^\d{5}$/.test(postalCode)) {
        throw new HttpError(409, `${label} postal code must contain 5 digits`);
    }
    return {
        name,
        firstName: firstName || name.split(/\s+/)[0] || name,
        lastName: lastName || name.split(/\s+/).slice(1).join(" ") || name,
        phone,
        addressLine1,
        addressLine2,
        addressLine3,
        postalCode,
        city,
        country,
        email: stringValue(value.email),
    };
}

async function sha256Hex(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

function requiredBodyInteger(body: JsonRecord, name: string): number {
    const value = Number(body[name]);
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new HttpError(400, `${name} must be a positive safe integer`);
    }
    return value;
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

function settingsJson(row: JsonRecord | null): JsonRecord {
    const settings = settingsFromRow(row);
    return {
        id: settings.id,
        modeCollection: settings.modeCollection,
        modeDelivery: settings.modeDelivery,
        senderName: settings.sender.name,
        senderFirstName: settings.sender.firstName,
        senderLastName: settings.sender.lastName,
        senderAddressLine1: settings.sender.addressLine1,
        senderAddressLine2: settings.sender.addressLine2,
        senderAddressLine3: settings.sender.addressLine3,
        senderPostalCode: settings.sender.postalCode,
        senderCity: settings.sender.city,
        senderCountry: settings.sender.country,
        senderPhone: settings.sender.phone,
        senderMobile: settings.sender.mobile,
        senderEmail: settings.sender.email,
        defaultWeightGrams: settings.defaultWeightGrams,
        defaultPackageCount: settings.defaultPackageCount,
        defaultLengthCm: settings.defaultLengthCm,
        defaultWidthCm: settings.defaultWidthCm,
        defaultHeightCm: settings.defaultHeightCm,
        defaultContent: settings.defaultContent,
        defaultShippingAmount: settings.defaultShippingAmount,
        declaredCurrency: settings.declaredCurrency,
        connectCulture: settings.connectCulture,
        connectVersionApi: settings.connectVersionApi,
        connectOutputFormat: settings.connectOutputFormat,
        connectOutputType: settings.connectOutputType,
        createdAt: stringValue(row?.created_at),
        updatedAt: stringValue(row?.updated_at),
    };
}

function settingsFromRow(row: JsonRecord | null): DeliverySettings {
    return {
        id: rowText(row, "id", "default"),
        modeCollection: rowText(row, "mode_collection", "CCC").toUpperCase(),
        modeDelivery: rowText(row, "mode_delivery", "24R").toUpperCase(),
        sender: {
            name: rowText(row, "sender_name", ""),
            firstName: rowText(row, "sender_firstname", ""),
            lastName: rowText(row, "sender_lastname", ""),
            addressLine1: rowText(row, "sender_address_line1", ""),
            addressLine2: rowText(row, "sender_address_line2", ""),
            addressLine3: rowText(row, "sender_address_line3", ""),
            city: rowText(row, "sender_city", ""),
            postalCode: rowText(row, "sender_postal_code", ""),
            country: rowText(row, "sender_country", "FR").toUpperCase(),
            phone: rowText(row, "sender_phone", ""),
            mobile: rowText(row, "sender_mobile", ""),
            email: rowText(row, "sender_email", ""),
        },
        defaultWeightGrams: rowInteger(row, "default_weight_grams", 500),
        defaultPackageCount: rowInteger(row, "default_package_count", 1),
        defaultLengthCm: rowInteger(row, "default_length_cm", 30),
        defaultWidthCm: rowInteger(row, "default_width_cm", 20),
        defaultHeightCm: rowInteger(row, "default_height_cm", 10),
        defaultContent: rowText(row, "default_content", "Products"),
        defaultShippingAmount: rowNonNegativeInteger(row, "default_shipping_amount", 450),
        declaredCurrency: rowText(row, "declared_currency", "EUR").toUpperCase(),
        connectCulture: rowText(row, "connect_culture", "fr-FR"),
        connectVersionApi: rowText(row, "connect_version_api", "1.0"),
        connectOutputFormat: rowText(row, "connect_output_format", "10x15"),
        connectOutputType: rowText(row, "connect_output_type", "PdfUrl"),
        createdAt: stringValue(row?.created_at),
        updatedAt: stringValue(row?.updated_at),
    };
}

function settingsRowFromBody(body: JsonRecord): JsonRecord {
    const row: JsonRecord = {};
    setText(row, body, "modeCollection", "mode_collection", (value) =>
        requireOneOf(value.toUpperCase(), ["CCC"], "modeCollection"),
    );
    setText(row, body, "modeDelivery", "mode_delivery", (value) =>
        requireOneOf(value.toUpperCase(), ["24R"], "modeDelivery"),
    );
    setText(row, body, "senderName", "sender_name");
    setText(row, body, "senderFirstName", "sender_firstname");
    setText(row, body, "senderLastName", "sender_lastname");
    setText(row, body, "senderAddressLine1", "sender_address_line1");
    setText(row, body, "senderAddressLine2", "sender_address_line2");
    setText(row, body, "senderAddressLine3", "sender_address_line3");
    setText(row, body, "senderPostalCode", "sender_postal_code");
    setText(row, body, "senderCity", "sender_city");
    setText(row, body, "senderCountry", "sender_country", (value) =>
        requireOneOf(value.toUpperCase(), ["FR"], "senderCountry"),
    );
    const country =
        typeof row.sender_country === "string"
            ? row.sender_country
            : stringValue(body.senderCountry || "FR").toUpperCase();
    setText(row, body, "senderPhone", "sender_phone", (value) => normalizeSettingsPhone(value, country, "senderPhone"));
    setText(row, body, "senderMobile", "sender_mobile", (value) =>
        normalizeSettingsPhone(value, country, "senderMobile"),
    );
    setText(row, body, "senderEmail", "sender_email");
    setPositiveInteger(row, body, "defaultWeightGrams", "default_weight_grams");
    setText(row, body, "defaultPackageCount", "default_package_count", (value) =>
        requireOneOf(value, ["1"], "defaultPackageCount"),
    );
    setPositiveInteger(row, body, "defaultLengthCm", "default_length_cm");
    setPositiveInteger(row, body, "defaultWidthCm", "default_width_cm");
    setPositiveInteger(row, body, "defaultHeightCm", "default_height_cm");
    setText(row, body, "defaultContent", "default_content");
    setNonNegativeInteger(row, body, "defaultShippingAmount", "default_shipping_amount");
    setText(row, body, "declaredCurrency", "declared_currency", (value) =>
        requireOneOf(value.toUpperCase(), ["EUR"], "declaredCurrency"),
    );
    setText(row, body, "connectCulture", "connect_culture");
    setText(row, body, "connectVersionApi", "connect_version_api");
    setText(row, body, "connectOutputFormat", "connect_output_format");
    setText(row, body, "connectOutputType", "connect_output_type");
    return row;
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

function rowText(row: JsonRecord | null, key: string, fallback: string): string {
    return stringValue(row?.[key]) || fallback;
}

function rowInteger(row: JsonRecord | null, key: string, fallback: number): number {
    const value = Number(row?.[key]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

function rowNonNegativeInteger(row: JsonRecord | null, key: string, fallback: number): number {
    const value = Number(row?.[key]);
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function hasOwn(record: JsonRecord, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}

function setText(
    row: JsonRecord,
    body: JsonRecord,
    source: string,
    target: string,
    transform: (value: string) => string = (value) => value,
): void {
    if (!hasOwn(body, source)) {
        return;
    }
    row[target] = transform(stringValue(body[source]));
}

function setPositiveInteger(row: JsonRecord, body: JsonRecord, source: string, target: string): void {
    if (!hasOwn(body, source)) {
        return;
    }
    const value = Number(stringValue(body[source]));
    if (!Number.isInteger(value) || value < 1) {
        throw new HttpError(400, `${source} must be a positive integer`);
    }
    row[target] = value;
}

function setNonNegativeInteger(row: JsonRecord, body: JsonRecord, source: string, target: string): void {
    if (!hasOwn(body, source)) {
        return;
    }
    const value = Number(stringValue(body[source]));
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new HttpError(400, `${source} must be a non-negative safe integer`);
    }
    row[target] = value;
}

function requireOneOf(value: string, options: string[], name: string): string {
    if (!options.includes(value)) {
        throw new HttpError(400, `${name} must be ${options.join(" or ")}`);
    }
    return value;
}

function requirePattern(value: string, pattern: RegExp, message: string): string {
    if (!pattern.test(value)) {
        throw new HttpError(400, message);
    }
    return value;
}

function normalizeSettingsPhone(value: string, country: string, name: string): string {
    const normalized = normalizePhone(value, country);
    if (value && !normalized) {
        throw new HttpError(400, `${name} must use E.164 international format`);
    }
    if (normalized && !/^\+[1-9]\d{7,14}$/.test(normalized)) {
        throw new HttpError(400, `${name} must use E.164 international format`);
    }
    return normalized;
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
