import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { collectionThemeTokenId } from "../../core/namespace";
import type { CollectionInstallation, CollectionStorage } from "../interfaces/store";

export async function assertInstallableCollectionResources(
    storage: CollectionStorage,
    installations: readonly Pick<CollectionInstallation, "collectionId" | "digest">[],
    candidate: CollectionRelease,
): Promise<void> {
    const releases = await Promise.all(
        installations.map(async (installation) => {
            const artifact = await storage.getRelease(installation.digest);
            if (!artifact || artifact.release.collectionId !== installation.collectionId) {
                throw new Error("Installed collection artifact is missing or inconsistent");
            }
            return artifact.release;
        }),
    );
    assertCollectionResourceIsolation([...releases, candidate]);
}

export function assertCollectionResourceIsolation(releases: readonly CollectionRelease[]): void {
    const blocTags = new Set<string>();
    const themeTokens = new Set<string>();
    for (const release of releases) {
        for (const bloc of release.blocs) {
            assertUnique(blocTags, bloc.id, "Bloc tag");
        }
        for (const token of release.theme?.categories.flatMap((category) => category.tokens) ?? []) {
            assertUnique(themeTokens, collectionThemeTokenId(release.collectionId, token.id), "theme token");
        }
    }
}

function assertUnique(seen: Set<string>, value: string, kind: string): void {
    if (seen.has(value)) {
        throw Object.assign(new Error(`${kind} already belongs to an installed collection: ${value}`), {
            status: 409,
        });
    }
    seen.add(value);
}
