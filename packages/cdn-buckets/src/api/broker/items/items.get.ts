import { getItem } from "../../../core/content/getItem";
import { getBrokerBucketId } from "../../../core/authentication/createBrokerGuard";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = getBrokerBucketId(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new TypeError("Missing 'id' query param.");
    return getItem(provider, bucketId, id);
});
