import { requireCredential } from "@bernouy/core";
import { createFolder } from "../../../core/content/createFolder";
import { parseFolderCreateDto } from "../../../core/validation/content/parseCreateFolderDto";
import type { BucketCredential } from "../../../interfaces/entities/BucketCredential";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = requireCredential<BucketCredential>(req).bucketId;
    const body = await req.json() as Record<string, unknown>;
    const dto = parseFolderCreateDto(body);
    return createFolder(provider, bucketId, dto);
});
