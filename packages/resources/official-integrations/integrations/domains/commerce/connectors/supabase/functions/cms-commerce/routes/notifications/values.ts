import { HttpError } from "../../core/errors.ts";
import { integer, requiredText } from "../../core/records.ts";

export type NotificationMode = "builtin" | "external" | "disabled";

export function boundedText(value: unknown, name: string, max: number): string {
    const result = requiredText(value, name);
    if (result.length > max) {
        throw new HttpError(400, `${name} is too long`);
    }
    return result;
}

export function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
    const result = integer(value, "limit") ?? fallback;
    return result >= min && result <= max ? result : fallback;
}

export function notificationMode(value: unknown, includeDisabled = true): NotificationMode {
    const mode = boundedText(value, "mode", 20);
    const allowed = includeDisabled ? ["builtin", "external", "disabled"] : ["builtin", "external"];
    if (!allowed.includes(mode)) {
        throw new HttpError(400, `mode must be ${allowed.join(", ")}`);
    }
    return mode as NotificationMode;
}
