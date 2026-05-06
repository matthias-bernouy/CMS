import { runProbe } from "../../core/edge/runProbe";
import { wrapAdmin } from "../../core/admin/wrapAdmin";

/**
 * Probe an edge via SSH to refresh its `lastSeen`, `usedBytes` and
 * `fileCount`. Pass `?id=<edgeId>` to probe one; omit to probe every
 * edge in parallel.
 */
export default wrapAdmin(async (req, provider) => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    return runProbe(provider, id);
});
