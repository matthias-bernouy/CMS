import {
    collectionAssetRepresentationVersion,
    replaceCollectionAssetExpressions,
    type CollectionRelease,
} from "@bernouy/cms-repository/collections";

export async function resolvePreviewCollectionAssets(
    input: string,
    releases: readonly CollectionRelease[],
    deliveryUrl: string,
): Promise<string> {
    const references = new Set<string>();
    replaceCollectionAssetExpressions(input, (collectionId, assetId) => {
        references.add(key(collectionId, assetId));
        return "";
    });
    if (references.size === 0) {
        return input;
    }
    const urls = new Map<string, string>();
    const releaseById = new Map(releases.map((release) => [release.collectionId, release]));
    await Promise.all(
        [...references].map(async (reference) => {
            const [collectionId, assetId] = splitKey(reference);
            const asset = releaseById.get(collectionId)?.assets.find(({ id }) => id === assetId);
            if (!asset) {
                throw new Error(`Unknown installed collection asset: ${collectionId}.${assetId}`);
            }
            const version = await collectionAssetRepresentationVersion(asset);
            urls.set(
                reference,
                `${deliveryUrl.replace(/\/$/u, "")}/.cms/collections/${encodeURIComponent(collectionId)}/assets/${encodeURIComponent(assetId)}?v=${version}`,
            );
        }),
    );
    return replaceCollectionAssetExpressions(input, (collectionId, assetId) => {
        const url = urls.get(key(collectionId, assetId));
        if (!url) {
            throw new Error(`Unknown installed collection asset: ${collectionId}.${assetId}`);
        }
        return url;
    });
}

export function previewAssetOrigin(deliveryUrl: string | undefined): string | null {
    if (!deliveryUrl) {
        return null;
    }
    try {
        return new URL(deliveryUrl).origin;
    } catch {
        return null;
    }
}

function key(collectionId: string, assetId: string): string {
    return `${collectionId}\0${assetId}`;
}

function splitKey(value: string): [string, string] {
    const offset = value.indexOf("\0");
    return [value.slice(0, offset), value.slice(offset + 1)];
}
