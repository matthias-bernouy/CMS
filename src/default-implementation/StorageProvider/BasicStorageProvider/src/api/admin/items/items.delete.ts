import { deleteItem } from "../../../core/content/deleteItem";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const search = new URL(req.url).searchParams;
    const id = search.get("id");
    const bucketId = search.get("bucketId");
    if (!id)       throw new TypeError("Missing 'id' query param.");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");

    const recursive = search.get("recursive") === "true";
    return deleteItem(provider, bucketId, id, recursive);
});
