import { HttpError, json, readJsonObject, requireCmsWriteRequest } from "../../http.ts";
import { relayPointsFromUrl } from "../../provider/relay.ts";
import { stringValue } from "../../shipment/payload.ts";
import { readRelaySelectionSetupContext } from "../../shipment/read-contexts.ts";
import { reserveDeliveryQuote } from "../../shipment/supabase.ts";
import { requiredBodyInteger, requiredBodyText } from "../body.ts";
import { settingsFromRow } from "../settings/presentation.ts";
import { deliveryQuoteJson } from "./presentation.ts";
import { captureValidation, fulfillmentAddressSnapshot, requiredMinorAmount, sha256Hex } from "./validation.ts";

export async function saveRelaySelection(request: Request): Promise<Response> {
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
