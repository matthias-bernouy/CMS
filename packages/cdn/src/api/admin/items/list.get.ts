import type { CDNItemType } from "@bernouy/core";
import { listItems } from "../../../core/content/listItems";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

const ALLOWED_TYPES: readonly CDNItemType[] = ["folder", "image", "video", "audio", "pdf", "document", "text", "archive", "other"];

export default wrapAdmin(async (req, provider) => {
    const search = new URL(req.url).searchParams;
    const bucketId = search.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");

    const folderID = search.get("folderID") ?? undefined;
    const page  = search.get("page")  ? Number(search.get("page"))  : undefined;
    const limit = search.get("limit") ? Number(search.get("limit")) : undefined;

    const acceptParam = search.get("accept");
    const accept = acceptParam
        ? acceptParam.split(",").map(s => s.trim()).filter((s): s is CDNItemType => ALLOWED_TYPES.includes(s as CDNItemType))
        : undefined;

    return listItems(provider, bucketId, {
        folderID,
        accept,
        pagination: page || limit ? { page: page ?? 1, limit: limit ?? 50 } : undefined,
    });
});
