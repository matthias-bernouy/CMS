import type { BucketLimits, BucketQuotas } from "@bernouy/core";

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
    /** Whitelist of browser origins authorized to upload to this bucket via the
     *  broker → frontière C flow. Each entry is a full origin
     *  (`"https://app.example.com"`) or `"*"` to allow any origin.
     *  Empty / missing = no cross-origin uploads (same-origin still works).
     *  Embedded in the upload token at mint time + checked on `POST /upload`
     *  so the CDN can emit the matching `Access-Control-Allow-Origin`. */
    allowedUploadOrigins?: string[];
};
