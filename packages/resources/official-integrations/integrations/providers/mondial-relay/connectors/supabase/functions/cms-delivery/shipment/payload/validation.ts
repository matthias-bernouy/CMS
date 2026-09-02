import { HttpError } from "../../http.ts";
import type { Address, ShipmentPayload } from "../types.ts";

export function validateShipmentPayload(payload: ShipmentPayload): void {
    if (!payload.externalOrderId) {
        throw new HttpError(400, "externalOrderId is required for protected fulfillment");
    }
    if (!["REL", "CCC"].includes(payload.modeCollection)) {
        throw new HttpError(400, "modeCollection must be REL or CCC for Mondial Relay Connect France");
    }
    if (payload.modeDelivery !== "24R") {
        throw new HttpError(400, "modeDelivery must be 24R for Mondial Relay Connect France");
    }
    if (!/^[A-Z0-9]{1,9}$/.test(payload.customerReference)) {
        throw new HttpError(400, "customerReference must contain 1 to 9 uppercase letters or digits");
    }
    requireFrance(payload.sender.country, "sender.country");
    requireFrance(payload.recipient.country, "recipient.country");
    requireFrance(payload.deliveryRelayCountry, "deliveryRelayLocation");
    requireAddress(payload.sender, "sender");
    requireAddress(payload.recipient, "recipient");
    if (payload.weightGrams < 1) {
        throw new HttpError(400, "weightGrams must be positive");
    }
    if (payload.packageCount !== 1) {
        throw new HttpError(400, "packageCount must be 1 for protected single-parcel fulfillment");
    }
    for (const [name, value] of [
        ["lengthCm", payload.lengthCm],
        ["widthCm", payload.widthCm],
        ["heightCm", payload.heightCm],
    ] as const) {
        if (value < 1) {
            throw new HttpError(400, `${name} must be positive`);
        }
    }
    validateMoney(payload.declaredValue, payload.declaredCurrency, "declaredValue");
    if (payload.declaredCurrency !== "EUR") {
        throw new HttpError(400, "declaredValue.currency must be EUR");
    }
}

function requireAddress(address: Address, label: string): void {
    for (const field of ["name", "addressLine1", "city", "postalCode", "country"] as const) {
        if (!address[field]) {
            throw new HttpError(400, `${label}.${field} is required`);
        }
    }
    validateFrenchPostalCode(address.postalCode, `${label}.postalCode`);
    validateInternationalPhone(address.phone, `${label}.phone`);
    validateInternationalPhone(address.mobile, `${label}.mobile`);
}

function requireFrance(value: string, name: string): void {
    if (value !== "FR") {
        throw new HttpError(400, `${name} must be FR for Mondial Relay Connect France`);
    }
}

function validateFrenchPostalCode(value: string, name: string): void {
    if (!/^\d{5}$/.test(value)) {
        throw new HttpError(400, `${name} must be 5 digits for FR`);
    }
}

function validateMoney(value: string, currency: string, name: string): void {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new HttpError(400, `${name}.value must be a non-negative number`);
    }
    if (amount > 0 && !currency) {
        throw new HttpError(400, `${name}.currency is required when ${name}.value is greater than 0`);
    }
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
        throw new HttpError(400, `${name}.currency must be a 3-letter currency code`);
    }
}

function validateInternationalPhone(value: string, name: string): void {
    if (value && !/^\+[1-9]\d{7,14}$/.test(value)) {
        throw new HttpError(400, `${name} must use E.164 international format`);
    }
}
