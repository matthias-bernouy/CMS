import type { OriginProvider } from "../../exports/OriginProvider";
import { regenerateAndReloadLsyncd } from "../lsyncd/reload";

/**
 * Remove an edge row and reload lsyncd so it stops pushing to it.
 *
 * Does NOT wipe data on the edge — operator can do that out-of-band.
 * Idempotent: a missing edge throws "not found" so the UI can show a
 * clear message instead of silently succeeding.
 */
export async function removeEdge(provider: OriginProvider, id: string): Promise<void> {
    const existing = await provider.edgeRepo.get(id);
    if (!existing) throw new Error(`Edge "${id}" not found.`);

    await provider.edgeRepo.delete(id);

    const edges = await provider.edgeRepo.list();
    if (provider.config.lsyncd) {
        await regenerateAndReloadLsyncd(provider.config.lsyncd, edges);
    }
}
