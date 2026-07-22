import { HttpError, isRecord } from "../http.ts";
import { issueLabelAccessToken, labelAccessContext } from "./supabase.ts";
import type { JsonRecord } from "./types.ts";

const tokenLifetimeMs = 10 * 60 * 1000;
const contextFunction = "get_label_access_context";

export async function issueLabelCapability(
    externalOrderId: string,
    sellerCmsUserId: string,
): Promise<{ token: string; expiresAt: string }> {
    if (!externalOrderId || !sellerCmsUserId) {
        throw new HttpError(400, "externalOrderId and sellerCmsUserId are required");
    }
    const token = randomToken();
    const expiresAt = new Date(Date.now() + tokenLifetimeMs).toISOString();
    await issueLabelAccessToken(externalOrderId, sellerCmsUserId, await sha256(token), expiresAt);
    return { token, expiresAt };
}

export async function shipmentForLabelCapability(token: string, sellerCmsUserId: string): Promise<JsonRecord> {
    if (!token || !sellerCmsUserId) {
        throw new HttpError(401, "a seller-bound label token is required");
    }
    const context = await labelAccessContext(await sha256(token), sellerCmsUserId);
    if (!validState(context)) {
        throw invalidContext();
    }
    if (context.state === "not_found") {
        throw new HttpError(404, "label token not found");
    }
    if (context.state === "expired") {
        throw new HttpError(410, "label token expired");
    }
    if (context.state === "label_missing") {
        throw new HttpError(404, "label not found");
    }
    if (!validShipmentContext(context)) {
        throw invalidContext();
    }
    return context.shipment;
}

function validState(value: unknown): value is JsonRecord & { state: string } {
    if (!isRecord(value) || typeof value.state !== "string") {
        return false;
    }
    if (["not_found", "expired", "label_missing"].includes(value.state)) {
        return exactKeys(value, ["state"]);
    }
    return value.state === "ok" && exactKeys(value, ["state", "shipment"]);
}

function validShipmentContext(value: JsonRecord): value is JsonRecord & { shipment: JsonRecord } {
    if (!isRecord(value.shipment) || !exactKeys(value.shipment, ["expedition_number", "label_url"])) {
        return false;
    }
    return (
        (typeof value.shipment.expedition_number === "string" || value.shipment.expedition_number === null) &&
        typeof value.shipment.label_url === "string" &&
        value.shipment.label_url.length > 0
    );
}

function exactKeys(value: JsonRecord, expected: string[]): boolean {
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function invalidContext(): HttpError {
    return new HttpError(502, `${contextFunction} returned an invalid response`);
}

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function randomToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
