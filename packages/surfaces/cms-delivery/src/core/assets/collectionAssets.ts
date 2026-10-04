import { replaceCollectionAssetExpressions, type CollectionAssetDefinition } from "@bernouy/cms-repository/collections";
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
    const snapshot = await assets.store.snapshot(assets.siteId);
    const urls = new Map<string, string>();
    for (const key of references) {
        const [collectionId, assetId] = splitReferenceKey(key);
        const installation = snapshot.collections.find((item) => item.collectionId === collectionId);
        const asset = installation?.release.assets.find((item) => item.id === assetId);
        if (!installation || !asset) {
            throw new Error(`Unknown installed collection asset: ${collectionId}.${assetId}`);
        }
        urls.set(key, collectionAssetUrl(delivery, collectionId, assetId, await collectionAssetVersion(asset)));
    }
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

/** Commits every response-relevant immutable property, not only the raw bytes. */
export async function collectionAssetVersion(asset: CollectionAssetDefinition): Promise<string> {
    const identity = new TextEncoder().encode(`${asset.digest}\0${asset.byteLength}\0${asset.mediaType}`);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", identity));
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function referenceKey(collectionId: string, assetId: string): string {
    return `${collectionId}\0${assetId}`;
}

function splitReferenceKey(key: string): [string, string] {
    const offset = key.indexOf("\0");
    return [key.slice(0, offset), key.slice(offset + 1)];
}
