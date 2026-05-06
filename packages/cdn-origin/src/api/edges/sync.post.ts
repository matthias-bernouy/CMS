import { kickEdgeSync } from "../../core/edge/syncCluster";
import { wrapAdmin } from "../../core/admin/wrapAdmin";

/**
 * Force lsyncd to restart, which triggers a full `init` rsync against
 * every edge. The optional `id` body field is currently advisory —
 * lsyncd has a single config that targets all edges. Per-edge kick
 * would need either separate lsyncd instances or out-of-band rsync,
 * both deferred until we actually have a use-case.
 */
export default wrapAdmin(async (_req, provider) => {
    await kickEdgeSync(provider);
    return { kicked: true };
});
