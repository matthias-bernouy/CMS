import { compareSemVer, releaseChannel } from "@bernouy/ulvia-contracts/compatibility";
import type {
    RepositoryResourceReference,
    RepositorySearchSnapshot,
    RepositorySearchSource,
} from "repository/repository/search/interfaces";

/** Select complete latest releases, retaining every row belonging to each selected release. */
export function latestReleaseRows<T extends { readonly reference: RepositoryResourceReference }>(
    rows: readonly T[],
): T[] {
    const versions = new Map<string, string>();
    const key = (reference: RepositoryResourceReference) =>
        `${reference.kind}\0${reference.id}\0${releaseChannel(reference.version)}`;
    for (const { reference } of rows) {
        const previous = versions.get(key(reference));
        if (!previous || compareSemVer(reference.version, previous) > 0) {
            versions.set(key(reference), reference.version);
        }
    }
    return rows.filter(({ reference }) => reference.version === versions.get(key(reference)));
}

/** One revision-bound business corpus shared by preparation, filters and ranking. */
export class RepositorySearchCorpus {
    private current?: RepositorySearchSnapshot;
    constructor(private readonly source: RepositorySearchSource) {}
    async load(): Promise<RepositorySearchSnapshot> {
        const snapshot = await this.source.load();
        if (this.current?.revision !== snapshot.revision) {
            this.current = { revision: snapshot.revision, rows: latestReleaseRows(snapshot.rows) };
        }
        return this.current;
    }
}
