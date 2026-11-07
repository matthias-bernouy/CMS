import { releaseChannel, compareSemVer } from "@bernouy/ulvia-contracts/compatibility";
import type { RepositoryCatalogueReference } from "../catalogueIndex";

type Channel = "stable" | "beta" | "all";
const snapshots = new WeakMap<
    readonly RepositoryCatalogueReference[],
    Map<Channel, readonly RepositoryCatalogueReference[]>
>();

/** Derived views live only as long as the immutable catalogue snapshot; there are three channel keys. */
export function latestCollections(entries: readonly RepositoryCatalogueReference[], channel: Channel) {
    const cached = snapshots.get(entries)?.get(channel);
    if (cached) {
        return cached;
    }
    const latest = new Map<string, RepositoryCatalogueReference>();
    for (const entry of entries) {
        if (channel !== "all" && releaseChannel(entry.version as string) !== channel) {
            continue;
        }
        const identity = `${entry.publisherId}\0${entry.collectionId}`;
        const previous = latest.get(identity);
        const comparison = previous ? compareSemVer(entry.version as string, previous.version as string) : 1;
        if (!previous || comparison > 0 || (comparison === 0 && String(entry.version) > String(previous.version))) {
            latest.set(identity, entry);
        }
    }
    const result = Object.freeze([...latest.values()]);
    if (Object.isFrozen(entries)) {
        const channels = snapshots.get(entries) ?? new Map();
        channels.set(channel, result);
        snapshots.set(entries, channels);
    }
    return result;
}
