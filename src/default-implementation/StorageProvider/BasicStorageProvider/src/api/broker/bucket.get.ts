import { getBucket } from "../../core/bucket/getBucket";
import { getBrokerBucketId } from "../../core/authentication/createBrokerGuard";
import { wrapAdmin } from "../../core/admin/wrapAdmin";

/** Frontier B — bucket info for the broker (used to seed StorageBrowser hydration). */
export default wrapAdmin(async (req, provider) => {
    const bucketId = getBrokerBucketId(req);
    const bucket = await getBucket(provider, bucketId);
    if (!bucket) throw new Error(`Bucket "${bucketId}" not found.`);
    return bucket;
});
