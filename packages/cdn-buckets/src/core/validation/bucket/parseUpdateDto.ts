import type { BucketLimits, BucketQuotas } from "../../../interfaces/entities/Bucket";
import { assertValidCacheControl } from "./cacheControl";
import { assertValidBucketQuotas } from "./quotas";
import { assertValidBucketLimits } from "./limits";
import { parseAllowedUploadOrigins } from "./allowedUploadOrigins";

// Flat wire shape (same reasoning as `parseCreateDto`). `id` is always pulled
// from the URL query, never the body. `quotas` and `limits` are atomic — both
// of their inner fields must be sent together to update them.
export type BucketUpdateDto = {
    cacheControl?: string;
    quotas?: BucketQuotas;
    limits?: BucketLimits;
    allowedUploadOrigins?: string[];
    notFoundPath?: string;
};

export function parseBucketUpdateDto(body: Record<string, unknown>): BucketUpdateDto {
    const dto: BucketUpdateDto = {};

    if (body.cacheControl !== undefined) {
        assertValidCacheControl(body.cacheControl);
        dto.cacheControl = body.cacheControl;
    }

    if (body.maxTotalSize !== undefined && body.maxFileCount !== undefined) {
        const quotas: BucketQuotas = {
            maxTotalSize: Number(body.maxTotalSize),
            maxFileCount: Number(body.maxFileCount),
        };
        assertValidBucketQuotas(quotas);
        dto.quotas = quotas;
    }

    if (body.maxFileSize !== undefined && body.acceptedMimeTypes !== undefined) {
        const limits: BucketLimits = {
            maxFileSize: Number(body.maxFileSize),
            acceptedMimeTypes: parseAcceptedMimeTypes(body.acceptedMimeTypes),
        };
        assertValidBucketLimits(limits);
        dto.limits = limits;
    }

    if (body.allowedUploadOrigins !== undefined) {
        dto.allowedUploadOrigins = parseAllowedUploadOrigins(body.allowedUploadOrigins);
    }

    if (body.notFoundPath !== undefined) {
        dto.notFoundPath = parseNotFoundPath(body.notFoundPath);
    }

    return dto;
}

function parseNotFoundPath(value: unknown): string | undefined {
    if (value === null || value === "") return undefined;
    if (typeof value !== "string") throw new TypeError("notFoundPath must be a string.");
    const v = value.trim().replace(/^\/+/, "");
    if (!v) return undefined;
    if (/[\\\s\x00]/.test(v) || v.includes("..")) {
        throw new TypeError(`invalid notFoundPath: "${value}".`);
    }
    return v;
}

function parseAcceptedMimeTypes(value: unknown): string[] | "*" {
    if (Array.isArray(value)) return value as string[];
    if (typeof value !== "string") return [];
    const t = value.trim();
    if (t === "*") return "*";
    return t.split(",").map(s => s.trim()).filter(Boolean);
}
