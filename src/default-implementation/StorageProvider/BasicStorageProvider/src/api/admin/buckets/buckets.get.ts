import { getBucket } from "../../../core/bucket/getBucket";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = new URL(req.url).searchParams.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");
    const bucket = await getBucket(provider, bucketId);
    if (!bucket) throw new Error(`Bucket "${bucketId}" not found.`);
    return bucket;
});
