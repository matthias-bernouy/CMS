import { createAlias } from "../../../core/alias/createAlias";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const search = new URL(req.url).searchParams;
    const bucketId = search.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");

    const body = await req.json() as Record<string, unknown>;
    if (typeof body.domain !== "string") throw new TypeError("'domain' must be a string.");
    const issueCert = body.issueCert === true || body.issueCert === "true" || body.issueCert === "on";
    return createAlias(provider, { domain: body.domain, bucketId, issueCert });
});
