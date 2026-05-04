import { createFolder } from "../../../core/content/createFolder";
import { parseFolderCreateDto } from "../../../core/validation/content/parseCreateFolderDto";
import { getBrokerBucketId } from "../../../core/authentication/createBrokerGuard";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const bucketId = getBrokerBucketId(req);
    const body = await req.json() as Record<string, unknown>;
    const dto = parseFolderCreateDto(body);
    return createFolder(provider, bucketId, dto);
});
