import { listBuckets } from "../../../core/bucket/listBuckets";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (_req, provider) => {
    return listBuckets(provider);
});
