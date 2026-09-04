import { HttpError, isRecord } from "../../http.ts";
import type { JsonRecord } from "../types.ts";

export function relayLocation(body: JsonRecord): string {
    const explicit = stringValue(body.deliveryRelayLocation ?? nested(body, "deliveryRelay", "location")).toUpperCase();
    if (/^[A-Z]{2}-[A-Z0-9]{3,10}$/.test(explicit)) {
        return explicit;
    }
    const number = stringValue(body.deliveryRelayNumber ?? nested(body, "deliveryRelay", "number")).toUpperCase();
    const country = (
        stringValue(body.deliveryRelayCountry ?? nested(body, "deliveryRelay", "country")) || "FR"
    ).toUpperCase();
    if (number) {
        return number.includes("-") ? number : `${country}-${number}`;
    }
    throw new HttpError(400, "deliveryRelayLocation is required for 24R pickup point delivery");
}

export function stringValue(value: unknown): string {
    if (typeof value === "string") {
        return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return "";
}

export function normalizePhone(value: string, country = "FR"): string {
    const raw = value.trim();
    if (!raw) {
        return "";
    }
    let text = raw.replace(/\(0\)/g, "").replace(/[\s.()/\-]/g, "");
    if (text.startsWith("00")) {
        text = `+${text.slice(2)}`;
    }
    if (!text.startsWith("+")) {
        const digits = text.replace(/\D/g, "");
        if (!digits) {
            return "";
        }
        if (country.toUpperCase() === "FR") {
            if (/^0[1-9]\d{8}$/.test(digits)) {
                return `+33${digits.slice(1)}`;
            }
            if (/^33[1-9]\d{8}$/.test(digits)) {
                return `+${digits}`;
            }
        }
        return `+${digits}`;
    }

    text = `+${text.slice(1).replace(/\D/g, "")}`;
    if (country.toUpperCase() === "FR" && /^\+330[1-9]\d{8}$/.test(text)) {
        return `+33${text.slice(4)}`;
    }
    return text;
}

export function integerValue(value: unknown, name: string): number {
    const text = stringValue(value);
    const number = Number(text);
    if (!Number.isInteger(number)) {
        throw new HttpError(400, `${name} must be an integer`);
    }
    return number;
}

export function minorAmount(value: unknown, name: string): number {
    const text = stringValue(value);
    const amount = Number(text);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 999_999_999) {
        throw new HttpError(400, `${name} must be an integer between 0 and 999999999 minor units`);
    }
    return amount;
}

export function minorAmountText(value: unknown, name: string): string {
    const amount = minorAmount(value, name);
    const major = Math.floor(amount / 100);
    const minor = String(amount % 100).padStart(2, "0");
    const text = `${major}.${minor}`;
    if (!/^\d{1,7}\.\d{2}$/.test(text)) {
        throw new HttpError(400, `${name} exceeds the Mondial Relay limit`);
    }
    return text;
}

export function currencyText(value: unknown, fallback = "EUR"): string {
    return (stringValue(value) || fallback).toUpperCase();
}

export function nested(body: JsonRecord, first: string, second: string): unknown {
    const value = body[first];
    return isRecord(value) ? value[second] : undefined;
}

export function phoneValue(value: unknown, fallback: string, country: string, name: string): string {
    const raw = stringValue(value) || fallback;
    const normalized = normalizePhone(raw, country);
    if (raw && !normalized) {
        throw new HttpError(400, `${name} must use E.164 international format`);
    }
    return normalized;
}
