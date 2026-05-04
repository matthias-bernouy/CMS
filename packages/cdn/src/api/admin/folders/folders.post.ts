import { createFolder } from "../../../core/content/createFolder";
import { parseFolderCreateDto } from "../../../core/validation/content/parseCreateFolderDto";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const search = new URL(req.url).searchParams;
    const bucketId = search.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");

    const body = await req.json() as Record<string, unknown>;
    // Auto-forwarded `folderID` from the page URL acts as the parent folder
    // when the body doesn't carry an explicit `parentFolderID`.
    if (body.parentFolderID === undefined) {
        const fromUrl = search.get("folderID");
        if (fromUrl) body.parentFolderID = fromUrl;
    }

    const dto = parseFolderCreateDto(body);
    return createFolder(provider, bucketId, dto);
});
