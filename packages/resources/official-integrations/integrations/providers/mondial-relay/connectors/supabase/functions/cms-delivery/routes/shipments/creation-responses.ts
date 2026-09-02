import { HttpError, json } from "../../http.ts";
import { updateShipment } from "../../shipment/supabase/index.ts";
import type { JsonRecord } from "../../shipment/types.ts";

export function shipmentReplayResponse(row: JsonRecord): Response {
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

export async function existingCreatingShipmentResponse(row: JsonRecord): Promise<Response> {
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

export function trackingUrl(expeditionNumber: string, postalCode: string): string {
    const url = new URL("https://www.mondialrelay.fr/suivi-de-colis/");
    url.searchParams.set("numeroExpedition", expeditionNumber);
    if (postalCode) {
        url.searchParams.set("codePostal", postalCode);
    }
    return url.toString();
}
