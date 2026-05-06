import { removeEdge } from "../../core/edge/removeEdge";
import { wrapAdmin } from "../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) throw new TypeError("Missing query param: id.");
    await removeEdge(provider, id);
    return { id };
});
