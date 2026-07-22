import type { JsonRecord } from "../shared/types.ts";
import { requiredString } from "./body/index.ts";
import { HttpError } from "./errors.ts";

export function requiredPayoutInterval(body: JsonRecord, name: string): "manual" | "daily" | "weekly" | "monthly" {
    const value = requiredString(body, name, 20);
    if (value !== "manual" && value !== "daily" && value !== "weekly" && value !== "monthly") {
        throw new HttpError(400, `${name} must be manual, daily, weekly, or monthly`);
    }
    return value;
}

export function optionalWeeklyPayoutDays(body: JsonRecord, name: string): string[] {
    const value = body[name];
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new HttpError(400, `${name} must be an array`);
    }
    const allowed = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
    const days = value.map((entry) => {
        if (typeof entry !== "string" || !allowed.has(entry)) {
            throw new HttpError(400, `${name} contains an invalid day`);
        }
        return entry;
    });
    if (new Set(days).size !== days.length) {
        throw new HttpError(400, `${name} contains duplicate days`);
    }
    return days;
}

export function optionalMonthlyPayoutDays(body: JsonRecord, name: string): number[] {
    const value = body[name];
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new HttpError(400, `${name} must be an array`);
    }
    const days = value.map((entry) => {
        if (!Number.isSafeInteger(entry) || Number(entry) < 1 || Number(entry) > 31) {
            throw new HttpError(400, `${name} must contain days from 1 to 31`);
        }
        return Number(entry);
    });
    if (new Set(days).size !== days.length) {
        throw new HttpError(400, `${name} contains duplicate days`);
    }
    return days;
}
