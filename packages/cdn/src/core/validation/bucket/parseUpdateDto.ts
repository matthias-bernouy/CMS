import type { BucketLimits, BucketQuotas } from "../../../interfaces/entities/Bucket";
import { assertValidCacheControl } from "./cacheControl";
import { assertValidBucketQuotas } from "./quotas";
import { assertValidBucketLimits } from "./limits";

// Flat wire shape (same reasoning as `parseCreateDto`). `id` is always pulled
// from the URL query, never the body. `quotas` and `limits` are atomic — both
// of their inner fields must be sent together to update them.
export type BucketUpdateDto = {
    cacheControl?: string;
    quotas?: BucketQuotas;
    limits?: BucketLimits;
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

    return dto;
}

function parseAcceptedMimeTypes(value: unknown): string[] | "*" {
    if (Array.isArray(value)) return value as string[];
    if (typeof value !== "string") return [];
    const t = value.trim();
    if (t === "*") return "*";
    return t.split(",").map(s => s.trim()).filter(Boolean);
}
