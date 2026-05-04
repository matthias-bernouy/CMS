import { renewAllAliases } from "../../../core/alias/renewAllAliases";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

/** Triggers `lego renew` for every registered alias. Idempotent: lego only
 *  renews certs close to expiry. Safe to run on a cron. */
export default wrapAdmin(async (_req, provider) => {
    return renewAllAliases(provider);
});
