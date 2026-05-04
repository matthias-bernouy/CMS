import type { BucketLimits, BucketQuotas } from "../../../../../../interfaces/CDN";

// Re-exported so consumers can keep importing them from `entities/Bucket`.
export type { BucketLimits, BucketQuotas };

export type Bucket = {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    quotas: BucketQuotas;
    limits: BucketLimits;
    /** Raw `Cache-Control` header value Nginx serves with public files of this bucket.
     *  Examples: `"public, max-age=31536000, immutable"` for media, `"no-store"` for HTML. */
    cacheControl: string;
};
