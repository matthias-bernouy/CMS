import { HttpError } from "./errors.ts";

export function validUrl(value: string, name: string): string {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new HttpError(400, `${name} is invalid`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new HttpError(400, `${name} must be an http or https URL`);
    }
    return parsed.toString();
}

export function validHttpsUrl(value: string, name: string): string {
    const normalized = validUrl(value, name);
    if (new URL(normalized).protocol !== "https:") {
        throw new HttpError(400, `${name} must be an https URL`);
    }
    return normalized;
}

export function requiredQueryText(request: Request, name: string, maxLength: number): string {
    const value = new URL(request.url).searchParams.get(name)?.trim() ?? "";
    if (!value) {
        throw new HttpError(400, `${name} is required`);
    }
    if (value.length > maxLength) {
        throw new HttpError(400, `${name} is too long`);
    }
    return value;
}

export function requiredQueryInteger(request: Request, name: string): number {
    const value = Number(new URL(request.url).searchParams.get(name));
    if (!Number.isInteger(value) || value <= 0) {
        throw new HttpError(400, `${name} must be a positive integer`);
    }
    return value;
}

export function queryLimit(value: string | null): number {
    if (!value) {
        return 100;
    }
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new HttpError(400, "limit must be a positive integer");
    }
    return Math.min(limit, 200);
}

export function searchPattern(value: string | null): string | null {
    const normalized = value?.trim() ?? "";
    if (!normalized) {
        return null;
    }
    if (normalized.length > 160) {
        throw new HttpError(400, "q is too long");
    }

    const safe = normalized
        .replace(/[^A-Za-z0-9@._+\-\s:]/g, " ")
        .trim()
        .replace(/\s+/g, "*");
    return safe ? `*${safe}*` : null;
}

export function optionalPaymentStatus(value: string | null): string | null {
    const status = value?.trim() ?? "";
    if (!status) {
        return null;
    }
    if (!["created", "requires_action", "processing", "succeeded", "failed", "cancelled"].includes(status)) {
        throw new HttpError(400, "status is invalid");
    }
    return status;
}

export function optionalSettlementStatus(value: string | null): string | null {
    const status = value?.trim() ?? "";
    if (!status) {
        return null;
    }
    if (
        ![
            "held",
            "eligible",
            "release_pending",
            "released",
            "blocked",
            "refund_pending",
            "refunded",
            "reversal_pending",
            "reversed",
            "manual_review",
        ].includes(status)
    ) {
        throw new HttpError(400, "settlementStatus is invalid");
    }
    return status;
}

export function requiredReleaseKind(value: unknown): "initial" | "reserve" | "recovery" {
    if (value === "initial" || value === "reserve" || value === "recovery") {
        return value;
    }
    throw new HttpError(400, "releaseKind is invalid");
}
