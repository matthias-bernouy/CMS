import { requireCredential } from "@bernouy/core";
import { getItem } from "../../../core/content/getItem";
import type { BucketCredential } from "../../../interfaces/entities/BucketCredential";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = requireCredential<BucketCredential>(req).bucketId;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new TypeError("Missing 'id' query param.");
    return getItem(provider, bucketId, id);
});
