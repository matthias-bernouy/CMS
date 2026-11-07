import { releaseChannel, compareSemVer } from "cms-repository/exports/contracts/compatibility";
import type { RepositoryCatalogueEntry } from "../catalogueIndex";

type Channel = "stable" | "beta" | "all";
const snapshots = new WeakMap<readonly RepositoryCatalogueEntry[], Map<Channel, readonly RepositoryCatalogueEntry[]>>();

/** Derived views live only as long as the immutable catalogue snapshot; there are three channel keys. */
export function latestCollections(entries: readonly RepositoryCatalogueEntry[], channel: Channel) {
    const cached = snapshots.get(entries)?.get(channel);
    if (cached) {
        return cached;
    }
    const latest = new Map<string, RepositoryCatalogueEntry>();
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
