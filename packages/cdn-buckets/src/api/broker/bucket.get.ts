import { requireCredential } from "@bernouy/core";
import { getBucket } from "../../core/bucket/getBucket";
import type { BucketCredential } from "../../interfaces/entities/BucketCredential";
import { wrapAdmin } from "../../core/admin/wrapAdmin";

/** Frontier B — bucket info for the broker (used to seed StorageBrowser hydration). */
export default wrapAdmin(async (req, provider) => {
    const bucketId = requireCredential<BucketCredential>(req).bucketId;
    const bucket = await getBucket(provider, bucketId);
    if (!bucket) throw new Error(`Bucket "${bucketId}" not found.`);
    return bucket;
});
