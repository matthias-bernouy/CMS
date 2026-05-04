import { deleteItem } from "../../../core/content/deleteItem";
import { getBrokerBucketId } from "../../../core/authentication/createBrokerGuard";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = getBrokerBucketId(req);
    const search = new URL(req.url).searchParams;
    const id = search.get("id");
    if (!id) throw new TypeError("Missing 'id' query param.");
    const recursive = search.get("recursive") === "true";
    return deleteItem(provider, bucketId, id, recursive);
});
