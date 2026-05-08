import { z } from "./zodInit";

/** Mirrors `BucketQuotas` from `@bernouy/cdn-buckets`. */
export const BucketQuotasSchema = z.object({
    maxTotalSize: z.number().int().positive().openapi({ description: "Max total bytes stored in the bucket" }),
    maxFileCount: z.number().int().positive(),
}).openapi("BucketQuotas");

/** Mirrors `BucketLimits` from `@bernouy/cdn-buckets`. */
export const BucketLimitsSchema = z.object({
    maxFileSize:       z.number().int().positive().openapi({ description: "Max bytes per uploaded file" }),
    acceptedMimeTypes: z.union([z.literal("*"), z.array(z.string())])
        .openapi({ description: "Either '*' (any MIME) or an explicit array, e.g. ['image/png','image/jpeg']" }),
}).openapi("BucketLimits");

/** Defaults applied at bucket creation time. All fields are overridable per request. */
export const BucketDefaultsSchema = z.object({
    cacheControl: z.string(),
    quotas:       BucketQuotasSchema,
    limits:       BucketLimitsSchema,
}).openapi("BucketDefaults");

export const BucketDefaultsPartialSchema = BucketDefaultsSchema.partial().openapi("BucketDefaultsPartial");
