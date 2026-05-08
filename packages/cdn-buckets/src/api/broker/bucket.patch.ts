import { requireCredential } from "@bernouy/core";
import { updateBucket } from "../../core/bucket/updateBucket";
import { parseBucketUpdateDto } from "../../core/validation/bucket/parseUpdateDto";
import type { BucketCredential } from "../../interfaces/entities/BucketCredential";
import { wrapAdmin } from "../../core/admin/wrapAdmin";

/**
 * Frontier B — self-service bucket settings update. The bucket is taken
 * from the broker credential, NOT a `?bucketId=` param, so a credential
 * can only mutate its own bucket. Currently used by the Delivery cron to
 * point a bucket's `notFoundPath` at its uploaded 404 page.
 *
 * Permitted fields are filtered (only `notFoundPath` for now); the same
 * parser is reused so future safe extensions land naturally.
 */
export default wrapAdmin(async (req, provider) => {
    const bucketId = requireCredential<BucketCredential>(req).bucketId;
    const body = (await req.json()) as Record<string, unknown>;

    const FIELDS_ALLOWED = new Set(["notFoundPath"]);
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
        if (FIELDS_ALLOWED.has(k)) filtered[k] = v;
    }

    const dto = parseBucketUpdateDto(filtered);
    return updateBucket(provider, bucketId, dto);
});
