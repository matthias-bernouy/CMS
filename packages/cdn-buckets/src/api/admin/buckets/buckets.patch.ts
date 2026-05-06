import { updateBucket } from "../../../core/bucket/updateBucket";
import { parseBucketUpdateDto } from "../../../core/validation/bucket/parseUpdateDto";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = new URL(req.url).searchParams.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");
    const body = await req.json() as Record<string, unknown>;
    const dto = parseBucketUpdateDto(body);
    return updateBucket(provider, bucketId, dto);
});
