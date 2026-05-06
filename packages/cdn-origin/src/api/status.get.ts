import { getOriginStatus } from "../core/monitoring/originStatus";
import { wrapAdmin } from "../core/admin/wrapAdmin";

export default wrapAdmin(async (_req, provider) => {
    return getOriginStatus(provider);
});
