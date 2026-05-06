import type { OriginProvider } from "../../exports/OriginProvider";
import { regenerateAndReloadLsyncd } from "../lsyncd/reload";

/**
 * Force lsyncd to restart, which triggers a full `init` rsync against
 * every edge. Intended as a "kick" button for the operator when they
 * suspect drift or just added an edge and want bootstrap to start now
 * (the regular reload path also does this — this is just the explicit
 * version exposed in the UI).
 *
 * The targeted-id flavour is currently a no-op — lsyncd does all targets
 * in one config; selective re-init would need either per-target config
 * files or an out-of-band rsync invocation. Left as a TODO and reflected
 * in the API: `sync.post.ts` accepts an optional id but kicks the whole
 * cluster either way.
 */
export async function kickEdgeSync(provider: OriginProvider): Promise<void> {
    const edges = await provider.edgeRepo.list();
    if (!provider.config.lsyncd) {
        throw new Error("lsyncd is not configured on this origin.");
    }
    await regenerateAndReloadLsyncd(provider.config.lsyncd, edges);
}
