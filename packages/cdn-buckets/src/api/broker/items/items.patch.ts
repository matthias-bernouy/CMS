import { updateItem } from "../../../core/content/updateItem";
import { parseUpdateItemDto } from "../../../core/validation/content/parseUpdateItemDto";
import { getBrokerBucketId } from "../../../core/authentication/createBrokerGuard";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = getBrokerBucketId(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new TypeError("Missing 'id' query param.");

    const body = await req.json() as Record<string, unknown>;
    const dto = parseUpdateItemDto(body);
    return updateItem(provider, bucketId, id, dto);
});
