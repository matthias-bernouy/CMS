import { HttpError, isRecord, json, ProviderStatusError, readJsonObject, requireCmsWriteRequest } from "../../http.ts";
import { createConnectShipment } from "../../provider/connect.ts";
import { shipmentPayload, stringValue } from "../../shipment/payload.ts";
import { reserveShipmentCreation, settingsRow, updateShipment } from "../../shipment/supabase.ts";
import { settingsFromRow } from "../settings/presentation.ts";
import { existingCreatingShipmentResponse, shipmentReplayResponse, trackingUrl } from "./creation-responses.ts";

export async function createShipment(request: Request): Promise<Response> {
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
