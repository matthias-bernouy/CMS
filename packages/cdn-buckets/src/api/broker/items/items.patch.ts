import { requireCredential } from "@bernouy/core";
import { updateItem } from "../../../core/content/updateItem";
import { parseUpdateItemDto } from "../../../core/validation/content/parseUpdateItemDto";
import type { BucketCredential } from "../../../interfaces/entities/BucketCredential";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = requireCredential<BucketCredential>(req).bucketId;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new TypeError("Missing 'id' query param.");

    const body = await req.json() as Record<string, unknown>;
    const dto = parseUpdateItemDto(body);
    return updateItem(provider, bucketId, id, dto);
});
