import { updateCredential } from "../../../core/credential/updateCredential";
import { parseCredentialUpdateDto } from "../../../core/validation/credential/parseUpdateDto";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const search = new URL(req.url).searchParams;
    const id = search.get("id");
    if (!id) throw new TypeError("Missing 'id' query param.");

    // bucketId is auto-forwarded from the page URL when called from the
    // bucket-detail page; if present we cross-check ownership.
    const bucketId = search.get("bucketId");

    const body = await req.json() as Record<string, unknown>;
    const dto = parseCredentialUpdateDto(body);

    return updateCredential(provider, id, bucketId, dto);
});
