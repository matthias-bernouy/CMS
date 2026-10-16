import { getOrGenerateEntryAsync, type Cache } from "@bernouy/http-runner";
import type { ContentReader } from "cms-content/application/interfaces/ContentReader";
import { generateBlocSetEntry } from "cms-content/blocs/core/composition/buildBlocEntries";
import { generateStyleEntry } from "cms-content/theme/core/generateStyleEntry";
import { getBlocGroupManifest } from "./blocGroupManifest";
import {
    blocRuntimeCacheKey,
    loadBindingCoreRuntimeEntry,
    loadBlocRuntimeEntry,
} from "cms-content/runtime-assets/runtimeAssets";
import { CMS_CACHE_KEYS } from "cms-content/application/core/cacheKeys";

/**
 * Content-addressed URLs for every asset a page references. The hash is the
 * entry's sha256 digest — a content change produces a new hash, hence a new
 * URL, which lets the endpoints serve these assets with `Cache-Control:
 * immutable` (1-year browser cache, zero revalidation).
 */
export type AssetsManifest = {
    blocRuntimeUrl: string;
    /** System bloc: the data-binding activation root. Resolved on every page;
     *  `renderPage` injects its `<script>` only when the composed HTML uses
     *  the `<cms-binding-core>` tag (default Shell does; a custom one may not). */
    bindingCoreUrl: string;
    styleUrl: string;
    /** The bloc-bundle URL(s) covering the page's blocs — one `/blocset`
     *  bundle today (the page's exact set); becomes several stable group
     *  URLs once blocs are grouped by signature. */
    blocUrls: string[];
    /** `[blocRuntimeUrl, ...blocUrls]` — convenience for emission in order. */
    scriptUrls: string[];
};

/**
 * Runtime asset resolution: loads prebuilt browser runtimes, warms the kernel
 * cache on miss and produces
 * hashed URLs under `<cmsPathPrefix>/`. Used by the live serving path; the
 * build pipeline has its own resolver that uploads to the CDN instead.
 *
 * Blocs ship as `/blocset` bundles chosen by the signature grouping (see
 * `blocGroupManifest`): the page's tags are mapped to the STABLE groups that
 * cover them, so a group bundle has the same content-hashed URL on every page
 * that uses it → cross-page / cross-visitor immutable cache reuse. Each group
 * is emitted whole (its full membership) — lossless, since co-signature blocs
 * always co-occur. Any tag the manifest doesn't yet know (a brand-new bloc, or
 * a manifest gone briefly stale) falls into one per-page bundle, so rendering
 * is always correct; when the manifest is empty this degrades cleanly to a
 * single per-page bundle. The per-bloc `/bloc?tag=` endpoint stays for the
 * editor/dev (unhashed) path.
 *
 * Parallel resolution is a no-op on the warm path and only pays when the
 * process just started.
 */
export type PageAssetContext = {
    content: ContentReader;
    cache: Cache;
    cmsPathPrefix: string;
    resolveContributedAssets(input: string): Promise<string>;
};

export async function resolvePageAssets(context: PageAssetContext, usedTags: string[]): Promise<AssetsManifest> {
    const prefix = context.cmsPathPrefix;
    const blocRuntimeJsUrl = `${prefix}/assets/bloc-runtime.js`;
    const blocRuntimeCacheEntryKey = blocRuntimeCacheKey(blocRuntimeJsUrl);
    const bindingCoreJsUrl = `${prefix}/assets/cms-binding-core.js`;
    const bindingCoreJsCacheKey = CMS_CACHE_KEYS.js(bindingCoreJsUrl);
    const collectionRevision = (await context.content.getContentRevision?.()) ?? 0;
    const collectionRevisionDigest = await digestContentRevision(collectionRevision);
    const collectionAssetReader = {
        getBlocViewJS: async (tag: string) => {
            const source = await context.content.getBlocViewJS(tag);
            return source ? context.resolveContributedAssets(source) : null;
        },
    };

    // Partition the page's blocs into the stable signature groups that cover
    // them + a fallback bundle for any tag the manifest doesn't know yet.
    const manifest = await getBlocGroupManifest(context.content);
    const groupIds = new Set<string>();
    const uncovered: string[] = [];
    for (const tag of new Set(usedTags)) {
        const gid = manifest.tagToGroup.get(tag);
        if (gid) {
            groupIds.add(gid);
        } else {
            uncovered.push(tag);
        }
    }

    // One sorted tag set per bundle. Deterministic order → a stable <script>
    // sequence. Group tags come from the manifest (already the full group);
    // the uncovered remainder is its own per-page bundle.
    const bundles: string[][] = [
        ...[...groupIds].sort().map((gid) => manifest.groups.get(gid)!),
        ...(uncovered.length ? [uncovered.sort()] : []),
    ];

    const [blocRuntimeEntry, bindingCoreEntry, styleEntry, ...bundleEntries] = await Promise.all([
        getOrGenerateEntryAsync(blocRuntimeCacheEntryKey, context.cache, loadBlocRuntimeEntry),
        getOrGenerateEntryAsync(bindingCoreJsCacheKey, context.cache, loadBindingCoreRuntimeEntry),
        getOrGenerateEntryAsync(CMS_CACHE_KEYS.STYLE, context.cache, () => generateStyleEntry(context.content)),
        ...bundles.map((tags) =>
            getOrGenerateEntryAsync(collectionBlocsetCacheKey(tags, collectionRevisionDigest), context.cache, () =>
                generateBlocSetEntry(tags, collectionAssetReader),
            ),
        ),
    ]);

    const blocRuntimeUrl = `${blocRuntimeJsUrl}?v=${blocRuntimeEntry!.hash}`;
    const bindingCoreUrl = `${bindingCoreJsUrl}?v=${bindingCoreEntry!.hash}`;
    const styleUrl = `${prefix}/style?v=${styleEntry!.hash}`;
    const blocAssets = bundles
        .map((tags, i) => ({ tags, entry: bundleEntries[i]! }))
        .filter((asset) => asset.entry.raw.length > 0);
    const blocUrls = blocAssets.map(
        ({ tags, entry }) =>
            `${prefix}/blocset?tags=${[...tags].sort().join(",")}&r=${collectionRevisionDigest}&v=${entry.hash}`,
    );
    const scriptUrls = [blocRuntimeUrl, ...blocUrls];

    return { blocRuntimeUrl, bindingCoreUrl, styleUrl, blocUrls, scriptUrls };
}

export function collectionBlocsetCacheKey(tags: string[], collectionRevision: number | string): string {
    return `${CMS_CACHE_KEYS.blocset(tags)}:collections:${collectionRevision}`;
}

async function digestContentRevision(revision: number | string): Promise<string> {
    const bytes = new TextEncoder().encode(String(revision));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
