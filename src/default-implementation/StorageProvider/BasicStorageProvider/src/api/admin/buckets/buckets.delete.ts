import { deleteBucket } from "../../../core/bucket/deleteBucket";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = new URL(req.url).searchParams.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");
    await deleteBucket(provider, bucketId);
    return { id: bucketId };
});
