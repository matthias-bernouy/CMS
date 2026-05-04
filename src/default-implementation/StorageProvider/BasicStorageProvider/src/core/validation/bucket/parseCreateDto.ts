import type { BucketLimits, BucketQuotas } from "../../../interfaces/entities/Bucket";
import { assertValidBucketId } from "./id";
import { assertValidCacheControl } from "./cacheControl";
import { assertValidBucketQuotas } from "./quotas";
import { assertValidBucketLimits } from "./limits";

// Wire shape is flat (matches what `<w13c-form>` submits — `Object.fromEntries`
// doesn't nest). The parser reshapes into the canonical nested entity here.
export type BucketCreateDto = {
    id: string;
    cacheControl: string;
    quotas: BucketQuotas;
    limits: BucketLimits;
};

export function parseBucketCreateDto(body: Record<string, unknown>): BucketCreateDto {
    const { id, cacheControl } = body;
    assertValidBucketId(id);
    assertValidCacheControl(cacheControl);

    const quotas: BucketQuotas = {
        maxTotalSize: Number(body.maxTotalSize),
        maxFileCount: Number(body.maxFileCount),
    };
    const limits: BucketLimits = {
        maxFileSize: Number(body.maxFileSize),
        acceptedMimeTypes: parseAcceptedMimeTypes(body.acceptedMimeTypes),
    };
    assertValidBucketQuotas(quotas);
    assertValidBucketLimits(limits);

    return { id, cacheControl, quotas, limits };
}

function parseAcceptedMimeTypes(value: unknown): string[] | "*" {
    if (Array.isArray(value)) return value as string[];
    if (typeof value !== "string") return [];
    const t = value.trim();
    if (t === "*") return "*";
    return t.split(",").map(s => s.trim()).filter(Boolean);
}
