import { collectionAssetRepresentationVersion } from "cms-repository/collections/core/admission/assets";
import { replaceCollectionAssetExpressions } from "cms-repository/collections/core/texts/expressions";
import type { CollectionStore } from "cms-repository/collections/installations/core/CollectionStore";

export const COLLECTION_ASSETS_ROUTE = "/_content/collections";

export type InstalledCollectionAssetSource = {
    siteId: string;
    store: Pick<CollectionStore, "getInstalledAssetMetadata" | "getInstalledAssetMetadataBatch" | "getReleaseAsset">;
};

export async function resolveInstalledCollectionAssets(
    input: string,
    source: InstalledCollectionAssetSource | undefined,
    basePath: string,
): Promise<string> {
    return (await resolveInstalledCollectionAssetSources([input], source, basePath)).get(input)!;
}

/** Resolves every immutable collection-asset expression with one metadata read. */
export async function resolveInstalledCollectionAssetSources(
    inputs: readonly string[],
    source: InstalledCollectionAssetSource | undefined,
    basePath: string,
): Promise<ReadonlyMap<string, string>> {
    const uniqueInputs = [...new Set(inputs)];
    const references = new Set<string>();
    for (const input of uniqueInputs) {
        replaceCollectionAssetExpressions(input, (collectionId, assetId) => {
            references.add(referenceKey(collectionId, assetId));
            return "";
        });
    }
    if (references.size === 0) {
        return new Map(uniqueInputs.map((input) => [input, input]));
    }
    if (!source) {
        throw new Error("Collection asset serving is not configured");
    }
    const installed = await source.store.getInstalledAssetMetadataBatch(
        source.siteId,
        [...references].map((key) => {
            const [collectionId, assetId] = splitReferenceKey(key);
            return { collectionId, assetId };
        }),
    );
    const urls = new Map<string, string>();
    await Promise.all(
        installed.map(async ({ collectionId, asset }) => {
            const version = await collectionAssetRepresentationVersion(asset);
            urls.set(
                referenceKey(collectionId, asset.id),
                `${basePath}${COLLECTION_ASSETS_ROUTE}/${encodeURIComponent(collectionId)}/assets/${encodeURIComponent(asset.id)}?v=${version}`,
            );
        }),
    );
    return new Map(
        uniqueInputs.map((input) => [
            input,
            replaceCollectionAssetExpressions(input, (collectionId, assetId) => {
                const url = urls.get(referenceKey(collectionId, assetId));
                if (!url) {
                    throw new Error(`Unknown installed collection asset: ${collectionId}.${assetId}`);
                }
                return url;
            }),
        ]),
    );
}

function referenceKey(collectionId: string, assetId: string): string {
    return `${collectionId}\0${assetId}`;
}

function splitReferenceKey(key: string): [string, string] {
    const offset = key.indexOf("\0");
    return [key.slice(0, offset), key.slice(offset + 1)];
}
