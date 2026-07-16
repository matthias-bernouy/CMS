import { HttpError } from "../http.ts";
import {
    issueLabelAccessToken,
    labelAccessTokenRow,
    privateShipmentRowById,
} from "./supabase.ts";
import type { JsonRecord } from "./types.ts";

const tokenLifetimeMs = 10 * 60 * 1000;

export async function issueLabelCapability(
    externalOrderId: string,
    sellerCmsUserId: string,
): Promise<{ token: string; expiresAt: string }> {
    if (!externalOrderId || !sellerCmsUserId) throw new HttpError(400, "externalOrderId and sellerCmsUserId are required");
    const token = randomToken();
    const expiresAt = new Date(Date.now() + tokenLifetimeMs).toISOString();
    await issueLabelAccessToken(externalOrderId, sellerCmsUserId, await sha256(token), expiresAt);
    return { token, expiresAt };
}

export async function shipmentForLabelCapability(token: string, sellerCmsUserId: string): Promise<JsonRecord> {
    if (!token || !sellerCmsUserId) throw new HttpError(401, "a seller-bound label token is required");
    const capability = await labelAccessTokenRow(await sha256(token), sellerCmsUserId);
    if (!capability || capability.revoked_at) throw new HttpError(404, "label token not found");
    const expiry = Date.parse(String(capability.expires_at ?? ""));
    if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new HttpError(410, "label token expired");
    const shipment = await privateShipmentRowById(String(capability.shipment_id));
    if (!shipment || !shipment.label_url
        || ["cancelled_unscanned", "cancelled", "manual_review"].includes(String(shipment.status))) {
        throw new HttpError(404, "label not found");
    }
    return shipment;
}

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
