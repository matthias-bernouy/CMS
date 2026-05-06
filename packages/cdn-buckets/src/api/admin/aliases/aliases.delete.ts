import { deleteAlias } from "../../../core/alias/deleteAlias";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const domain = new URL(req.url).searchParams.get("domain");
    if (!domain) throw new TypeError("Missing 'domain' query param.");
    return deleteAlias(provider, domain);
});
