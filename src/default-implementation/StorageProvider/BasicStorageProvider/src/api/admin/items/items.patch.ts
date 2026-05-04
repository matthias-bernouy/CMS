import { updateItem } from "../../../core/content/updateItem";
import { parseUpdateItemDto } from "../../../core/validation/content/parseUpdateItemDto";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const search = new URL(req.url).searchParams;
    const id       = search.get("id");
    const bucketId = search.get("bucketId");
    if (!id)       throw new TypeError("Missing 'id' query param.");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");

    const body = await req.json() as Record<string, unknown>;
    const dto = parseUpdateItemDto(body);
    return updateItem(provider, bucketId, id, dto);
});
