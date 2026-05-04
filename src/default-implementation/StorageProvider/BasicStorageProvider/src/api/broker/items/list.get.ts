import type { CDNItemType } from "../../../../../../../interfaces/CDN";
import { listItems } from "../../../core/content/listItems";
import { getBrokerBucketId } from "../../../core/authentication/createBrokerGuard";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

const ALLOWED_TYPES: readonly CDNItemType[] = ["folder", "image", "video", "audio", "pdf", "document", "text", "archive", "other"];

export default wrapAdmin(async (req, provider) => {
    const bucketId = getBrokerBucketId(req);
    const search = new URL(req.url).searchParams;

    const folderID = search.get("folderID") ?? undefined;
    const page  = search.get("page")  ? Number(search.get("page"))  : undefined;
    const limit = search.get("limit") ? Number(search.get("limit")) : undefined;
    const sortBy    = (search.get("sortBy")    ?? undefined) as "name" | "createdAt" | "updatedAt" | "size" | undefined;
    const sortOrder = (search.get("sortOrder") ?? undefined) as "asc" | "desc" | undefined;
    const searchTerm = search.get("search") ?? undefined;

    const acceptParam = search.get("accept");
    const accept = acceptParam
        ? acceptParam.split(",").map(s => s.trim()).filter((s): s is CDNItemType => ALLOWED_TYPES.includes(s as CDNItemType))
        : undefined;

    return listItems(provider, bucketId, {
        folderID,
        accept,
        sortBy,
        sortOrder,
        search: searchTerm,
        pagination: page || limit ? { page: page ?? 1, limit: limit ?? 50 } : undefined,
    });
});
