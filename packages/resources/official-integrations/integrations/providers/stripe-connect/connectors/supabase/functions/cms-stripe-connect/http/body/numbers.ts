import type { JsonRecord } from "../../shared/types.ts";
import { HttpError } from "../errors.ts";

export function requiredInteger(body: JsonRecord, name: string): number {
    const value = body[name];
    if (typeof value === "string" && value.trim()) {
        const number = Number(value);
        if (Number.isInteger(number)) {
            return number;
        }
    }
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new HttpError(400, `${name} must be an integer`);
    }
    return value;
}

export function optionalPositiveInteger(body: JsonRecord, name: string): number | null {
    if (body[name] === undefined || body[name] === null) {
        return null;
    }
    const value = requiredInteger(body, name);
    if (value <= 0) {
        throw new HttpError(400, `${name} must be positive`);
    }
    return value;
}

export function optionalNonNegativeInteger(body: JsonRecord, name: string): number | null {
    if (body[name] === undefined || body[name] === null) {
        return null;
    }
    const value = requiredInteger(body, name);
    if (value < 0) {
        throw new HttpError(400, `${name} must be non-negative`);
    }
    return value;
}

export function optionalBoolean(body: JsonRecord, name: string): boolean | null {
    const value = body[name];
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== "boolean") {
        throw new HttpError(400, `${name} must be a boolean`);
    }
    return value;
}
