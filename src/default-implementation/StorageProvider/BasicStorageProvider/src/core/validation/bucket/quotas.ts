import type { BucketQuotas } from "../../../interfaces/entities/Bucket";

export function assertValidBucketQuotas(value: unknown): asserts value is BucketQuotas {
    if (typeof value !== "object" || value === null) {
        throw new TypeError("quotas must be an object.");
    }
    const { maxTotalSize, maxFileCount } = value as Partial<BucketQuotas>;
    if (!Number.isInteger(maxTotalSize) || (maxTotalSize as number) <= 0) {
        throw new Error("quotas.maxTotalSize must be a positive integer.");
    }
    if (!Number.isInteger(maxFileCount) || (maxFileCount as number) <= 0) {
        throw new Error("quotas.maxFileCount must be a positive integer.");
    }
}
