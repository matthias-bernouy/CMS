import type { CDN } from "@bernouy/core";
import type { DeliveryRepository } from "src/delivery/interfaces/DeliveryRepository";
import type { AssetsManifest } from "src/delivery/core/assets/resolveAssets";
import { generateBlocEntry } from "src/delivery/core/blocs/buildBloc";
import { generateStyleEntry } from "src/delivery/core/assets/buildStyle";
import { generateComponentJsEntry } from "src/delivery/core/assets/buildComponent";
import { generateFaviconEntry } from "src/delivery/core/assets/defaultFavicon";
import { putHashedAsset } from "src/delivery/build/cdnIO";

/**
 * Per-runOnce asset orchestrator. Uploads the assets that don't depend on
 * a specific page (component runtime, theme CSS, default favicon) once at
 * the start of the cycle, and exposes a `resolveAssets(usedTags)` closure
 * that the build-mode `RenderContext` plugs into `renderPage`. Bloc
 * bundles are uploaded on demand and memoized so pages sharing a bloc
 * pay the upload only once per cycle.
 */
export type BuildAssetsContext = {
    componentUrl: string;
    styleUrl:     string;
    faviconUrl:   string;
    /** sha256 of every shared asset uploaded during this cycle, ready to
     *  drop into `DeployManifest.sharedAssets`. Bloc hashes are added
     *  lazily as pages are rendered, so read this AFTER the render pass. */
    sharedAssetHashes: () => Record<string, string>;
    /** Number of bytes that actually transferred to the CDN during this
     *  cycle (skip-on-conflict counts as 0). */
    freshUploads: () => number;
    resolveAssets: (usedTags: string[]) => Promise<AssetsManifest>;
};

export async function createBuildAssetsContext(
    assetsBucket: CDN,
    repository:   DeliveryRepository,
): Promise<BuildAssetsContext> {
    const blocUrlByTag    = new Map<string, string>();
    const blocHashByTag   = new Map<string, string>();
    const sharedHashes: Record<string, string> = {};
    let freshCount = 0;

    const tally = (fresh: boolean) => { if (fresh) freshCount++; };

    const componentEntry = await generateComponentJsEntry();
    const componentRes = await putHashedAsset(assetsBucket, {
        hash: componentEntry.hash,
        bytes: componentEntry.raw,
        contentType: componentEntry.contentType,
        extension: ".js",
    });
    tally(componentRes.fresh);
    sharedHashes["component"] = componentEntry.hash;

    const styleEntry = await generateStyleEntry(repository);
    const styleRes = await putHashedAsset(assetsBucket, {
        hash: styleEntry.hash,
        bytes: styleEntry.raw,
        contentType: styleEntry.contentType,
        extension: ".css",
    });
    tally(styleRes.fresh);
    sharedHashes["style"] = styleEntry.hash;

    const faviconEntry = generateFaviconEntry();
    const faviconRes = await putHashedAsset(assetsBucket, {
        hash: faviconEntry.hash,
        bytes: faviconEntry.raw,
        contentType: faviconEntry.contentType,
        extension: ".svg",
    });
    tally(faviconRes.fresh);
    sharedHashes["favicon"] = faviconEntry.hash;

    return {
        componentUrl: componentRes.absoluteURL,
        styleUrl:     styleRes.absoluteURL,
        faviconUrl:   faviconRes.absoluteURL,

        sharedAssetHashes: () => {
            const out = { ...sharedHashes };
            for (const [tag, h] of blocHashByTag) out[`bloc:${tag}`] = h;
            return out;
        },
        freshUploads: () => freshCount,

        resolveAssets: async (usedTags) => {
            const blocUrls: string[] = [];
            for (const tag of usedTags) {
                let url = blocUrlByTag.get(tag);
                if (!url) {
                    const entry = await generateBlocEntry(tag, repository);
                    const r = await putHashedAsset(assetsBucket, {
                        hash: entry.hash,
                        bytes: entry.raw,
                        contentType: entry.contentType,
                        extension: ".js",
                    });
                    tally(r.fresh);
                    url = r.absoluteURL;
                    blocUrlByTag.set(tag, url);
                    blocHashByTag.set(tag, entry.hash);
                }
                blocUrls.push(url);
            }
            return {
                componentUrl: componentRes.absoluteURL,
                styleUrl:     styleRes.absoluteURL,
                blocUrls,
                scriptUrls:   [componentRes.absoluteURL, ...blocUrls],
            };
        },
    };
}
