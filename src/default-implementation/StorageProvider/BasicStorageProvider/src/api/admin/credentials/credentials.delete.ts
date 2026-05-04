import { deleteCredential } from "../../../core/credential/deleteCredential";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const search = new URL(req.url).searchParams;
    const id = search.get("id");
    if (!id) throw new TypeError("Missing 'id' query param.");
    const bucketId = search.get("bucketId");

    await deleteCredential(provider, id, bucketId);
    return { id };
});
