import { InMemoryReleaseCatalogue, type CatalogueContractRelease } from "@bernouy/cms-repository/contracts/catalogue";
import { compareSemVer, satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";
import type { CollectionRelease } from "@bernouy/cms-repository/collections";

/** Reconstruct the dependency order without hydrating fixture bytes or discarding historical yank witnesses. */
export async function orderContracts(
    records: readonly CatalogueContractRelease[],
): Promise<readonly CatalogueContractRelease[]> {
    const catalogue = new InMemoryReleaseCatalogue();
    const pending = [...records];
    const ordered: CatalogueContractRelease[] = [];
    while (pending.length) {
        let progress = false;
        let failure: unknown;
        for (let index = 0; index < pending.length; ) {
            const record = pending[index]!;
            try {
                await catalogue.restore(record.admission.canonicalJson, record.admission.digest, record.publishedAt);
            } catch (error) {
                failure ??= error;
                index++;
                continue;
            }
            ordered.push(record);
            pending.splice(index, 1);
            progress = true;
        }
        if (!progress) {
            throw failure;
        }
    }
    return ordered;
}

export function orderCollections<
    T extends { release: Pick<CollectionRelease, "publisherId" | "collectionId" | "version" | "dependencies"> },
>(records: readonly T[]): readonly T[] {
    const pending = [...records].sort((left, right) => compareSemVer(left.release.version, right.release.version));
    const ordered: T[] = [];
    const matches = (
        release: Pick<CollectionRelease, "publisherId" | "collectionId" | "version">,
        dependency: NonNullable<CollectionRelease["dependencies"]>[number],
    ) =>
        release.publisherId === dependency.publisherId &&
        release.collectionId === dependency.collectionId &&
        satisfiesVersionRange(release.version, dependency.versionRange);
    while (pending.length) {
        const index = pending.findIndex(
            ({ release }) =>
                !pending.some(
                    ({ release: other }) =>
                        other.publisherId === release.publisherId &&
                        other.collectionId === release.collectionId &&
                        compareSemVer(other.version, release.version) < 0,
                ) &&
                (release.dependencies ?? []).every(
                    (dependency) =>
                        !records.some((record) => matches(record.release, dependency)) ||
                        ordered.some((record) => matches(record.release, dependency)),
                ),
        );
        if (index === -1) {
            throw new Error("Cannot order local collection dependencies for push all");
        }
        ordered.push(pending.splice(index, 1)[0]!);
    }
    return ordered;
}
