import { CmsFilesError } from "cms-files/core/credentials";

export function boundedText(value: string, maximum: number): string {
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > maximum) {
        throw new CmsFilesError("INVALID_INPUT", 422);
    }
    return value;
}

export function normalizeMimeType(value: string): string {
    const normalized = boundedText(value, 255).toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+\/[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(normalized)) {
        throw new CmsFilesError("INVALID_INPUT", 422);
    }
    return normalized;
}

export function validFutureDate(value: string, now: Date): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date <= now) {
        throw new CmsFilesError("INVALID_INPUT", 422);
    }
    return date.toISOString();
}
