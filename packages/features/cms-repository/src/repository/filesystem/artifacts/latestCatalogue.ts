import { join } from "node:path";
import { deepFreeze } from "cms-repository/exports/contracts/protocol";
import type { LocalRepositoryYanks } from "../yanks";
import type { RepositoryCatalogueEntry } from "../catalogueIndex";
import { listDirectories } from "../core/immutableFiles";
import { collectionReferences, validCollectionScope } from "./collectionReferences";
import type { CollectionReferenceScope } from "./collectionReferences";

type Channel = "stable" | "beta" | "all";

/** Cached coordinate heads, never release documents or assets. At most three bounded channel views. */
export class LatestCollectionCatalogue {
    private revision = 0;
    private readonly values = new Map<Channel, readonly RepositoryCatalogueEntry[]>();
    private readonly pending = new Map<Channel, Promise<readonly RepositoryCatalogueEntry[]>>();
    constructor(
        private readonly root: string,
        private readonly yanks: Pick<LocalRepositoryYanks, "entries">,
    ) {}

    invalidate() {
        this.revision++;
        this.values.clear();
    }

    async history(input: CollectionReferenceScope): Promise<readonly RepositoryCatalogueEntry[]> {
        if (!validCollectionScope(input)) {
            return [];
        }
        const yanked = new Set((await this.yanks.entries("collection")).map((entry) => entry.coordinate));
        return collectionReferences(this.root, input, yanked);
    }

    async read(channel: Channel, refresh = false): Promise<readonly RepositoryCatalogueEntry[]> {
        if (refresh) {
            this.invalidate();
        }
        const current = this.values.get(channel);
        if (current) {
            return current;
        }
        const running = this.pending.get(channel);
        if (running) {
            return running;
        }
        const load = this.current(channel).finally(() => {
            if (this.pending.get(channel) === load) {
                this.pending.delete(channel);
            }
        });
        this.pending.set(channel, load);
        return load;
    }

    private async current(channel: Channel): Promise<readonly RepositoryCatalogueEntry[]> {
        for (let attempt = 0; attempt < 3; attempt++) {
            const revision = this.revision;
            const entries = await this.build(channel);
            if (this.revision === revision) {
                this.values.set(channel, entries);
                return entries;
            }
        }
        throw new Error("Catalogue changed repeatedly during discovery");
    }

    private async build(channel: Channel): Promise<readonly RepositoryCatalogueEntry[]> {
        const entries: RepositoryCatalogueEntry[] = [];
        let bytes = 0;
        const releases = join(this.root, "releases");
        const yanked = new Set((await this.yanks.entries("collection")).map((entry) => entry.coordinate));
        for (const publisherId of await listDirectories(releases)) {
            for (const name of await listDirectories(join(releases, publisherId))) {
                const references = await collectionReferences(
                    this.root,
                    { publisherId, collectionId: `${publisherId}/${name}`, channel },
                    yanked,
                );
                const latest = references.at(-1);
                if (!latest) {
                    continue;
                }
                bytes += Buffer.byteLength(JSON.stringify(latest));
                if (entries.length >= 10_000 || bytes > 16 * 1024 * 1024) {
                    throw new Error("Latest collection index exceeds its bounds");
                }
                entries.push(latest);
            }
        }
        entries.sort((a, b) => {
            const left = `${a.publisherId}\0${a.collectionId}`;
            const right = `${b.publisherId}\0${b.collectionId}`;
            return left < right ? -1 : left > right ? 1 : 0;
        });
        return deepFreeze(entries);
    }
}
