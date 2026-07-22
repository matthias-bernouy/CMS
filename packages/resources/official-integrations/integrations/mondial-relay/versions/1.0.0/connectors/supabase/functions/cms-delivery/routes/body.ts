import { HttpError } from "../http.ts";
import { stringValue } from "../shipment/payload.ts";
import type { JsonRecord } from "../shipment/types.ts";

export function requiredBodyText(body: JsonRecord, name: string, maxLength: number): string {
    const value = stringValue(body[name]);
    if (!value) {
        throw new HttpError(400, `${name} is required`);
    }
    if (value.length > maxLength) {
        throw new HttpError(400, `${name} is too long`);
    }
    return value;
}

export function requiredBodyInteger(body: JsonRecord, name: string): number {
    const value = Number(body[name]);
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new HttpError(400, `${name} must be a positive safe integer`);
    }
    return value;
}
