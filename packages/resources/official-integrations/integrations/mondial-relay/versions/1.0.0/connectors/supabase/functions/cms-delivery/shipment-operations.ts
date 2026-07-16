import { HttpError } from "./http.ts";
import { validatedMondialRelayLabelUrl } from "./label-url.ts";
import { cancelShipmentUnscanned, insertShipmentRecoveryEvent, shipmentRowByExternalOrderId, shipmentRowById, updateShipment } from "./supabase.ts";
import type { JsonRecord } from "./types.ts";

export async function declareSellerHandoff(externalOrderId: string): Promise<JsonRecord> {
    const row = await requiredShipment(externalOrderId);
    if (row.seller_handoff_declared_at) return handoffResult(row);
    if (row.carrier_accepted_at || !["label_ready"].includes(String(row.status))) {
        throw new HttpError(409, "seller handoff cannot be declared for the current shipment state");
    }
    const declaredAt = new Date().toISOString();
    const updated = await updateShipment(String(row.id), {
        seller_handoff_declared_at: declaredAt,
    }, String(row.status));
    if (!updated) throw new HttpError(409, "shipment state changed while declaring seller handoff");
    return handoffResult(updated);
}

export async function cancelShipmentReservation(externalOrderId: string, trackingUntil: string): Promise<JsonRecord> {
    if (!externalOrderId || !trackingUntil) throw new HttpError(400, "externalOrderId and trackingUntil are required");
    return shipmentResult(await cancelShipmentUnscanned(externalOrderId, trackingUntil));
}

export async function recoverUnknownShipment(
    shipmentId: string,
    externalOrderId: string,
    expeditionNumber: string,
    labelUrl: string,
    actorCmsUserId: string,
    reason: string,
): Promise<JsonRecord> {
    if (!/^\d{8}$/.test(expeditionNumber)) throw new HttpError(400, "expeditionNumber must contain 8 digits");
    if (!actorCmsUserId || reason.trim().length < 8) throw new HttpError(400, "an administrator and a recovery reason are required");
    const row = await shipmentRowById(shipmentId);
    if (!row || row.external_order_id !== externalOrderId) {
        throw new HttpError(404, "exact shipment creation reservation not found");
    }
    if (["created", "label_ready"].includes(String(row.status)) && row.expedition_number === expeditionNumber) {
        return {
            ...shipmentResult(row),
            idempotentReplay: true,
        };
    }
    if (row.status !== "unknown") throw new HttpError(409, "only an unknown shipment reservation can be recovered");
    const validatedLabelUrl = labelUrl ? validatedMondialRelayLabelUrl(labelUrl).toString() : "";
    await insertShipmentRecoveryEvent({
        shipment_id: row.id,
        actor_cms_user_id: actorCmsUserId,
        reason: reason.trim(),
        previous_status: row.status,
        expedition_number: expeditionNumber,
    });
    const updated = await updateShipment(String(row.id), {
        expedition_number: expeditionNumber,
        tracking_number: expeditionNumber,
        status: validatedLabelUrl ? "label_ready" : "created",
        label_url: validatedLabelUrl || null,
        tracking_url: trackingUrl(expeditionNumber, String(row.recipient_postal_code ?? "")),
        last_error: null,
    }, "unknown");
    if (!updated) throw new HttpError(409, "shipment state changed while applying recovery");
    return shipmentResult(updated);
}

async function requiredShipment(externalOrderId: string): Promise<JsonRecord> {
    if (!externalOrderId) throw new HttpError(400, "externalOrderId is required");
    const row = await shipmentRowByExternalOrderId(externalOrderId);
    if (!row) throw new HttpError(404, "shipment not found");
    return row;
}

function handoffResult(row: JsonRecord): JsonRecord {
    return {
        ...shipmentResult(row),
        sellerHandoffDeclaredAt: row.seller_handoff_declared_at,
    };
}

function shipmentResult(row: JsonRecord): JsonRecord {
    return {
        id: row.id,
        externalOrderId: row.external_order_id,
        expeditionNumber: row.expedition_number,
        status: row.status,
        carrierAcceptedAt: row.carrier_accepted_at,
        recipientHandoffAt: row.recipient_handoff_at,
    };
}

function trackingUrl(expeditionNumber: string, postalCode: string): string {
    const url = new URL("https://www.mondialrelay.fr/suivi-de-colis/");
    url.searchParams.set("numeroExpedition", expeditionNumber);
    if (postalCode) url.searchParams.set("codePostal", postalCode);
    return url.toString();
}
