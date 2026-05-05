import type { CDN, FileMetadata } from "@bernouy/core";
import { MANIFEST_FILENAME, type DeployManifest } from "src/delivery/interfaces/DeployManifest";
import type { GeneratedVariant } from "src/delivery/interfaces/VariantGenerator";
import { pageBucketName, pagePublicPath } from "src/delivery/build/pathSlug";

/**
 * CDN read/write primitives used by `DeliveryBuilder.runOnce()`. Each helper
 * wraps a single bucket call and surfaces only what the orchestrator needs
 * (e.g. variant uploads return both the URL and a `fresh` flag so the
 * counter knows whether the upload actually transferred bytes).
 */

export async function loadManifest(
    htmlBucket: CDN,
    fetcher: typeof fetch = fetch,
): Promise<DeployManifest | null> {
    const list = await htmlBucket.getItems({ search: MANIFEST_FILENAME });
    if (!list.ok) return null;
    const file = list.data.items.find(
        (i): i is FileMetadata => i.type !== "folder" && i.name === MANIFEST_FILENAME,
    );
    if (!file) return null;
    const res = await fetcher(file.absoluteURL);
    if (!res.ok) return null;
    try {
        return await res.json() as DeployManifest;
    } catch {
        return null;
    }
}

export async function uploadManifest(htmlBucket: CDN, manifest: DeployManifest): Promise<void> {
    const res = await htmlBucket.uploadFile({
        data: new TextEncoder().encode(JSON.stringify(manifest)),
        name: MANIFEST_FILENAME,
        mimeType: "application/json",
        overwrite: true,
    });
    if (!res.ok) throw new Error(`Failed to upload manifest: ${res.error.message}`);
}

export type HashedAssetInput = {
    hash: string;
    bytes: Uint8Array;
    contentType: string;
    /** Extension with leading dot, e.g. `".webp"` or `".js"`. */
    extension: string;
};

/**
 * Upload a content-hashed asset to the assets bucket. `name = <hash><ext>`,
 * `overwrite: false` so re-uploading an identical asset becomes a no-op
 * via the bucket-level `conflict` response (looked up by name to recover
 * the existing `absoluteURL`).
 *
 * Used for variants AND for shared assets (component.js, style.css,
 * favicon.svg, bloc bundles) — anything content-addressable.
 */
export async function putHashedAsset(
    assetsBucket: CDN,
    asset: HashedAssetInput,
): Promise<{ absoluteURL: string; fresh: boolean }> {
    const name = asset.hash + asset.extension;
    const res = await assetsBucket.uploadFile({
        data: asset.bytes,
        name,
        mimeType: asset.contentType,
        overwrite: false,
    });
    if (res.ok) return { absoluteURL: res.data.absoluteURL, fresh: true };

    if (res.error.code === "conflict") {
        const list = await assetsBucket.getItems({ search: name });
        if (list.ok) {
            const existing = list.data.items.find(
                (i): i is FileMetadata => i.type !== "folder" && i.name === name,
            );
            if (existing) return { absoluteURL: existing.absoluteURL, fresh: false };
        }
    }
    throw new Error(`Failed to upload asset ${name}: ${res.error.message}`);
}

export function uploadVariant(
    assetsBucket: CDN,
    generated: GeneratedVariant,
): Promise<{ absoluteURL: string; fresh: boolean }> {
    return putHashedAsset(assetsBucket, generated);
}

export async function uploadHtml(htmlBucket: CDN, pagePath: string, html: string): Promise<void> {
    const res = await htmlBucket.uploadFile({
        data: new TextEncoder().encode(html),
        name: pageBucketName(pagePath),
        publicPath: pagePublicPath(pagePath),
        mimeType: "text/html; charset=utf-8",
        overwrite: true,
    });
    if (!res.ok) throw new Error(`Failed to upload page ${pagePath}: ${res.error.message}`);
}

/**
 * Remove pages from the html bucket that were in the previous manifest but
 * are no longer in the repository. Best-effort — a single failure does not
 * abort the cycle, since a stale page is preferable to a stuck builder.
 */
export async function deleteOrphanPages(
    htmlBucket: CDN,
    currentPaths: ReadonlySet<string>,
    oldManifest: DeployManifest,
): Promise<number> {
    let deleted = 0;
    for (const oldPath of Object.keys(oldManifest.pages)) {
        if (currentPaths.has(oldPath)) continue;
        const name = pageBucketName(oldPath);
        const list = await htmlBucket.getItems({ search: name });
        if (!list.ok) continue;
        const file = list.data.items.find(
            (i): i is FileMetadata => i.type !== "folder" && i.name === name,
        );
        if (!file) continue;
        const res = await htmlBucket.deleteItem({ id: file.id });
        if (res.ok) deleted++;
    }
    return deleted;
}

/**
 * Walk the assets bucket and delete every file whose name's hash prefix is
 * not in the supplied `liveHashes` set. Items follow the `<hash><ext>`
 * naming convention (`putHashedAsset`); items that don't match are left
 * alone (defensive — a bucket shared with another tenant might store
 * files under different conventions).
 *
 * Listing is paginated and gathered in full before any deletion to avoid
 * page-shift races. `_manifest.json` lives in the html bucket, not assets,
 * so it can never appear here.
 */
export async function gcOrphanAssets(
    assetsBucket: CDN,
    liveHashes: ReadonlySet<string>,
): Promise<number> {
    const orphans: string[] = [];
    let page = 1;
    const limit = 200;
    for (;;) {
        const list = await assetsBucket.getItems({ pagination: { page, limit } });
        if (!list.ok) break;
        for (const item of list.data.items) {
            if (item.type === "folder") continue;
            const dotIdx = item.name.indexOf(".");
            const hash = dotIdx >= 0 ? item.name.slice(0, dotIdx) : item.name;
            // Defensive: only GC items that look like our `<hash><ext>` convention.
            if (!/^[a-f0-9]{32,}$/.test(hash)) continue;
            if (liveHashes.has(hash)) continue;
            orphans.push(item.id);
        }
        if (!list.data.hasMore) break;
        page++;
    }
    let deleted = 0;
    for (const id of orphans) {
        const res = await assetsBucket.deleteItem({ id });
        if (res.ok) deleted++;
    }
    return deleted;
}
