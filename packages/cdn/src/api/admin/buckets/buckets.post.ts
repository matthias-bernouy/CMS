import { createBucket } from "../../../core/bucket/createBucket";
import { parseBucketCreateDto } from "../../../core/validation/bucket/parseCreateDto";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const body = await req.json() as Record<string, unknown>;
    const dto = parseBucketCreateDto(body);
    return createBucket(provider, dto);
});
