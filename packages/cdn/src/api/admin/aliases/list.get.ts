import { listAliasesByBucket } from "../../../core/alias/listAliases";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = new URL(req.url).searchParams.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");
    return listAliasesByBucket(provider, bucketId);
});
