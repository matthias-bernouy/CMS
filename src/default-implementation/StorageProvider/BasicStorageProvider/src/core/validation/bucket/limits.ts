import type { BucketLimits } from "../../../interfaces/entities/Bucket";
import { isMimePattern } from "../upload/mimeType";

export function assertValidBucketLimits(value: unknown): asserts value is BucketLimits {
    if (typeof value !== "object" || value === null) {
        throw new TypeError("limits must be an object.");
    }
    const { maxFileSize, acceptedMimeTypes } = value as Partial<BucketLimits>;
    if (!Number.isInteger(maxFileSize) || (maxFileSize as number) <= 0) {
        throw new Error("limits.maxFileSize must be a positive integer.");
    }
    if (acceptedMimeTypes === "*") return;
    if (!Array.isArray(acceptedMimeTypes) || acceptedMimeTypes.length === 0) {
        throw new Error("limits.acceptedMimeTypes must be \"*\" or a non-empty array of MIME patterns.");
    }
    for (const pattern of acceptedMimeTypes) {
        if (!isMimePattern(pattern)) {
            throw new Error(`limits.acceptedMimeTypes contains invalid pattern: ${JSON.stringify(pattern)}.`);
        }
    }
}
