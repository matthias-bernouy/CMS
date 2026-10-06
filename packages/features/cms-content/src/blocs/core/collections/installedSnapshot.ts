import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";

type InstalledSnapshot = Awaited<ReturnType<CollectionStore["snapshot"]>>;

/** Shares one immutable installation snapshot across all projections for the current revision. */
export function createInstalledSnapshotReader(
    store: CollectionStore,
    siteId: string,
): () => Promise<InstalledSnapshot> {
    let cache: InstalledSnapshot | undefined;
    let pending: Promise<InstalledSnapshot> | undefined;
    return async () => {
        const revision = await store.revision(siteId);
        if (cache?.revision === revision) {
            return cache;
        }
        if (pending) {
            const loaded = await pending;
            if (loaded.revision === revision) {
                return loaded;
            }
        }
        const loading = store.snapshot(siteId);
        pending = loading;
        try {
            const loaded = await loading;
            cache = loaded;
            return loaded;
        } finally {
            if (pending === loading) {
                pending = undefined;
            }
        }
    };
}
