import { getOrGenerateEntryAsync, type Cache } from "@bernouy/http-runner";
import type { ContentReader, RenderableBloc } from "cms-content/application/interfaces/ContentReader";
import type { RenderingSettings } from "cms-content/settings/interfaces/settings";
import { generateBlocSetEntry } from "cms-content/blocs/core/composition/buildBlocEntries";
import { generateStyleEntry } from "cms-content/theme/core/generateStyleEntry";
import {
    collectionBlocStyleCacheKey,
    generateBlocStyleEntry,
    groupBlocStylesByCollection,
} from "./generateBlocStyleGroupEntry";
import { getBlocGroupManifest } from "./blocGroupManifest";
import {
    blocRuntimeCacheKey,
    loadBindingCoreRuntimeEntry,
    loadBlocRuntimeEntry,
} from "cms-content/runtime-assets/runtimeAssets";
import { CMS_CACHE_KEYS } from "cms-content/application/core/cacheKeys";
import type { BlocViewCache } from "cms-content/blocs/core/usage/resolveUsedBlocTags";

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
    /** Immutable contribution-owned stylesheets required by this Page. */
    blocStyleUrls: string[];
    /** The bloc-bundle URL(s) covering the page's blocs — one `/blocset`
     *  bundle today (the page's exact set); becomes several stable group
     *  URLs once blocs are grouped by signature. */
    blocUrls: string[];
    /** `[blocRuntimeUrl, ...blocUrls]` when behavior exists, otherwise empty. */
    scriptUrls: string[];
};

/**
 * Loads prebuilt browser runtimes, warms the Kernel cache and produces hashed
 * URLs under `<cmsPathPrefix>/`; the build pipeline uploads its own entries.
 *
 * Bloc behavior ships as stable signature-group `/blocset` bundles. Unknown
 * tags fall into one per-page bundle, while `/bloc?tag=` remains editor-only.
 *
 * Parallel resolution is a no-op on the warm path and only pays when the
 * process just started.
 */
export type PageAssetContext = {
    content: ContentReader;
    cache: Cache;
    cmsPathPrefix: string;
    renderingSettings?: RenderingSettings;
    contentRevision?: number | string;
    blocViews?: BlocViewCache;
    resolveContributedAssets(input: string): Promise<string>;
};

export async function resolvePageAssets(
    context: PageAssetContext,
    usedTags: string[],
    renderableBlocSnapshot?: readonly RenderableBloc[],
): Promise<AssetsManifest> {
    const prefix = context.cmsPathPrefix;
    const blocRuntimeJsUrl = `${prefix}/assets/bloc-runtime.js`;
    const blocRuntimeCacheEntryKey = blocRuntimeCacheKey(blocRuntimeJsUrl);
    const bindingCoreJsUrl = `${prefix}/assets/cms-binding-core.js`;
    const bindingCoreJsCacheKey = CMS_CACHE_KEYS.js(bindingCoreJsUrl);
    const collectionRevision = context.contentRevision ?? (await context.content.getContentRevision?.()) ?? 0;
    const collectionRevisionDigest = await digestContentRevision(collectionRevision);
    const renderingRevision = (await context.content.getRenderingRevision?.()) ?? collectionRevision;
    const renderingRevisionDigest = await digestContentRevision(renderingRevision);
    const collectionAssetReader = {
        getBlocViewJS: async (tag: string) => {
            const source = await (context.blocViews?.get(tag) ?? context.content.getBlocViewJS(tag));
            return source ? context.resolveContributedAssets(source) : null;
        },
    };

    const renderableBlocs = renderableBlocSnapshot ?? (await context.content.getRenderableBlocs());
    const manifest = await getBlocGroupManifest(
        context.content,
        collectionRevision,
        renderableBlocs,
        context.blocViews,
    );
    const blocsById = new Map(renderableBlocs.map((bloc) => [bloc.id, bloc]));

    // Partition the page's blocs into the stable signature groups that cover
    // them + a fallback bundle for any tag the manifest doesn't know yet.
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

    // Group tags come from the manifest (already the full group);
    // the uncovered remainder is its own per-page bundle.
    const candidateBundles: string[][] = [
        ...[...groupIds].sort().map((gid) => manifest.groups.get(gid)!),
        ...(uncovered.length ? [uncovered.sort()] : []),
    ];
    const behaviorBundles = candidateBundles
        .map((tags) => tags.filter((tag) => blocsById.get(tag)?.hasBehavior))
        .filter((tags) => tags.length > 0);
    const styleBundles = candidateBundles.flatMap((tags) => groupBlocStylesByCollection(tags, blocsById));

    const [blocRuntimeEntry, bindingCoreEntry, styleEntry, behaviorEntries, blocStyleEntries] = await Promise.all([
        getOrGenerateEntryAsync(blocRuntimeCacheEntryKey, context.cache, loadBlocRuntimeEntry),
        getOrGenerateEntryAsync(bindingCoreJsCacheKey, context.cache, loadBindingCoreRuntimeEntry),
        getOrGenerateEntryAsync(CMS_CACHE_KEYS.style(renderingRevisionDigest), context.cache, () =>
            generateStyleEntry(
                context.renderingSettings
                    ? { getRenderingSettings: async () => context.renderingSettings! }
                    : context.content,
                [],
                context.resolveContributedAssets,
            ),
        ),
        Promise.all(
            behaviorBundles.map((tags) =>
                getOrGenerateEntryAsync(collectionBlocsetCacheKey(tags, collectionRevisionDigest), context.cache, () =>
                    generateBlocSetEntry(tags, collectionAssetReader),
                ),
            ),
        ),
        Promise.all(
            styleBundles.map(({ collectionId, tags }) =>
                getOrGenerateEntryAsync(
                    collectionBlocStyleCacheKey(collectionId, tags, collectionRevisionDigest),
                    context.cache,
                    () =>
                        generateBlocStyleEntry(
                            tags.map((tag) => ({ id: tag, styleCSS: blocsById.get(tag)!.styleCSS! })),
                            context.resolveContributedAssets,
                        ),
                ),
            ),
        ),
    ]);

    const blocRuntimeUrl = `${blocRuntimeJsUrl}?v=${blocRuntimeEntry!.hash}`;
    const bindingCoreUrl = `${bindingCoreJsUrl}?v=${bindingCoreEntry!.hash}`;
    const styleUrl = `${prefix}/style?r=${renderingRevisionDigest}&v=${styleEntry!.hash}`;
    const blocUrls = behaviorBundles.map(
        (tags, index) =>
            `${prefix}/blocset?tags=${[...tags].sort().join(",")}&r=${collectionRevisionDigest}&v=${behaviorEntries[index]!.hash}`,
    );
    const blocStyleUrls = styleBundles.map(
        ({ collectionId, tags }, index) =>
            `${prefix}/blocstyles?collection=${encodeURIComponent(collectionId)}&tags=${tags.join(",")}&r=${collectionRevisionDigest}&v=${blocStyleEntries[index]!.hash}`,
    );
    const scriptUrls = blocUrls.length > 0 ? [blocRuntimeUrl, ...blocUrls] : [];

    return { blocRuntimeUrl, bindingCoreUrl, styleUrl, blocStyleUrls, blocUrls, scriptUrls };
}

export function collectionBlocsetCacheKey(tags: string[], collectionRevision: number | string): string {
    return `${CMS_CACHE_KEYS.blocset(tags)}:collections:${collectionRevision}`;
}

export async function digestContentRevision(revision: number | string): Promise<string> {
    const bytes = new TextEncoder().encode(String(revision));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
