import { replaceCollectionAssetExpressions, type CollectionRelease } from "@bernouy/cms-repository/collections";
import { replaceCollectionTextExpressions } from "@bernouy/cms-repository/collections/texts";

type InstalledRelease = Readonly<{ release: CollectionRelease }>;
type TargetRelease = Readonly<{ artifact: Readonly<{ release: CollectionRelease }> }>;

export function finalCollectionReleases(
    installed: readonly InstalledRelease[],
    targets: readonly TargetRelease[],
): CollectionRelease[] {
    const byId = new Map(targets.map(({ artifact }) => [artifact.release.collectionId, artifact.release]));
    return installed.map(({ release }) => byId.get(release.collectionId) ?? release);
}

export function collectionTextIds(releases: readonly CollectionRelease[]): Map<string, Set<string>> {
    return new Map(
        releases.map((release) => [release.collectionId, new Set((release.texts ?? []).map(({ id }) => id))]),
    );
}

export function assertCollectionAssetReferences(content: string, releases: readonly CollectionRelease[]): void {
    const assets = new Map(
        releases.map((release) => [release.collectionId, new Set(release.assets.map(({ id }) => id))]),
    );
    replaceCollectionAssetExpressions(content, (collectionId, assetId) => {
        if (!assets.get(collectionId)?.has(assetId)) {
            throw new Error(`references collection asset ${collectionId}.${assetId}`);
        }
        return "";
    });
}

export function assertCollectionTextReferences(content: string, texts: ReadonlyMap<string, ReadonlySet<string>>): void {
    replaceCollectionTextExpressions(content, (collectionId, textId) => {
        if (!texts.get(collectionId)?.has(textId)) {
            throw new Error(`references collection text ${collectionId}.${textId}`);
        }
        return "";
    });
}
