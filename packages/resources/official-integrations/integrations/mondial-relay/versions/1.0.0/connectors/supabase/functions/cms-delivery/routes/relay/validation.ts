import { HttpError, isRecord } from "../../http.ts";
import { normalizePhone, stringValue } from "../../shipment/payload.ts";
import type { JsonRecord } from "../../shipment/types.ts";

export function captureValidation<T>(validate: () => T): { ok: true; value: T } | { ok: false; error: unknown } {
    try {
        return { ok: true, value: validate() };
    } catch (error) {
        return { ok: false, error };
    }
}

export function requiredMinorAmount(value: unknown, name: string): number {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 999_999_999) {
        throw new HttpError(400, `${name} must be an integer between 0 and 999999999 minor units`);
    }
    return amount;
}

export function optionalMinorAmount(value: unknown, name: string): number | null {
    return value === undefined || value === null || value === "" ? null : requiredMinorAmount(value, name);
}

export function optionalPositiveInteger(value: unknown, name: string): number | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const integer = Number(value);
    if (!Number.isSafeInteger(integer) || integer < 1) {
        throw new HttpError(400, `${name} must be a positive integer`);
    }
    return integer;
}

export function fulfillmentAddressSnapshot(value: unknown, label: "recipient" | "seller", seller: boolean): JsonRecord {
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

export async function sha256Hex(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
