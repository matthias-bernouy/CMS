import { requireCredential } from "@bernouy/core";
import { deleteItem } from "../../../core/content/deleteItem";
import type { BucketCredential } from "../../../interfaces/entities/BucketCredential";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = requireCredential<BucketCredential>(req).bucketId;
    const search = new URL(req.url).searchParams;
    const id = search.get("id");
    if (!id) throw new TypeError("Missing 'id' query param.");
    const recursive = search.get("recursive") === "true";
    return deleteItem(provider, bucketId, id, recursive);
});
