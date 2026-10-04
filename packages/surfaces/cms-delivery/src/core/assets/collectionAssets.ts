import {
    collectionAssetRepresentationVersion,
    replaceCollectionAssetExpressions,
} from "@bernouy/cms-repository/collections";
import type DeliveryCms from "cms-delivery/DeliveryCms";

export const COLLECTION_ASSETS_ROUTE = "/.cms/collections";

export async function resolveCollectionAssetExpressions(input: string, delivery: DeliveryCms): Promise<string> {
    const references = new Set<string>();
    replaceCollectionAssetExpressions(input, (collectionId, assetId) => {
        references.add(referenceKey(collectionId, assetId));
        return "";
    });
    if (references.size === 0) {
        return input;
    }
    const assets = delivery.collectionAssets;
    if (!assets) {
        throw new Error("Collection asset serving is not configured");
    }
    const installed = await assets.store.getInstalledAssetMetadataBatch(
        assets.siteId,
        [...references].map((key) => {
            const [collectionId, assetId] = splitReferenceKey(key);
            return { collectionId, assetId };
        }),
    );
    const urls = new Map<string, string>();
    await Promise.all(
        installed.map(async ({ collectionId, asset }) => {
            urls.set(
                referenceKey(collectionId, asset.id),
                collectionAssetUrl(delivery, collectionId, asset.id, await collectionAssetVersion(asset)),
            );
        }),
    );
    return replaceCollectionAssetExpressions(input, (collectionId, assetId) => {
        const url = urls.get(referenceKey(collectionId, assetId));
        if (!url) {
            throw new Error(`Unknown installed collection asset: ${collectionId}.${assetId}`);
        }
        return url;
    });
}

export function collectionAssetUrl(
    delivery: DeliveryCms,
    collectionId: string,
    assetId: string,
    version: string,
): string {
    return `${delivery.basePath}${COLLECTION_ASSETS_ROUTE}/${encodeURIComponent(collectionId)}/assets/${encodeURIComponent(assetId)}?v=${version}`;
}

export const collectionAssetVersion = collectionAssetRepresentationVersion;

function referenceKey(collectionId: string, assetId: string): string {
    return `${collectionId}\0${assetId}`;
}

function splitReferenceKey(key: string): [string, string] {
    const offset = key.indexOf("\0");
    return [key.slice(0, offset), key.slice(offset + 1)];
}
