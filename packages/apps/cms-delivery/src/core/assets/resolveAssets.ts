import type DeliveryCms from "cms-delivery/DeliveryCms";
import { getOrGenerateEntryAsync } from "@bernouy/cms-shared";
import { generateBlocSetEntry } from "cms-delivery/core/blocs/buildBloc";
import { generateStyleEntry } from "cms-delivery/core/assets/buildStyle";
import { generateComponentJsEntry } from "cms-delivery/core/assets/buildComponent";
import { P9R_CACHE } from "@bernouy/cms-shared";

/**
 * Content-addressed URLs for every asset a page references. The hash is the
 * entry's sha256 digest — a content change produces a new hash, hence a new
 * URL, which lets the endpoints serve these assets with `Cache-Control:
 * immutable` (1-year browser cache, zero revalidation).
 */
export type AssetsManifest = {
    componentUrl: string;
    styleUrl:     string;
    /** The bloc-bundle URL(s) covering the page's blocs — one `/blocset`
     *  bundle today (the page's exact set); becomes several stable group
     *  URLs once blocs are grouped by signature. */
    blocUrls:     string[];
    /** `[componentUrl, ...blocUrls]` — convenience for emission in order. */
    scriptUrls:   string[];
};

/**
 * Runtime asset resolution: warms the delivery cache on miss and produces
 * hashed URLs under `<cmsPathPrefix>/`. Used by the live serving path; the
 * build pipeline has its own resolver that uploads to the CDN instead.
 *
 * The page's blocs ship as ONE `/blocset` bundle (their viewJS concatenated
 * + compressed once) instead of one `/bloc?tag=` request each: fewer requests
 * and a single brotli stream that shares its dictionary across blocs. The set
 * is sorted so any page using the same blocs hits the same immutable bundle.
 * The per-bloc `/bloc?tag=` endpoint stays for the editor/dev (unhashed) path.
 *
 * Parallel resolution is a no-op on the warm path and only pays when the
 * process just started.
 */
export async function resolveRuntimeAssets(
    delivery: DeliveryCms,
    usedTags: string[],
): Promise<AssetsManifest> {
    const prefix              = delivery.cmsPathPrefix;
    const componentJsUrl      = `${prefix}/assets/component.js`;
    const componentJsCacheKey = P9R_CACHE.js(componentJsUrl);
    const sortedTags          = [...new Set(usedTags)].sort();

    const [componentEntry, styleEntry, blocSetEntry] = await Promise.all([
        getOrGenerateEntryAsync(componentJsCacheKey, delivery.cache, generateComponentJsEntry),
        getOrGenerateEntryAsync(P9R_CACHE.STYLE,     delivery.cache, () => generateStyleEntry(delivery.repository)),
        sortedTags.length
            ? getOrGenerateEntryAsync(
                P9R_CACHE.blocset(sortedTags), delivery.cache,
                () => generateBlocSetEntry(sortedTags, delivery.repository),
              )
            : Promise.resolve(null),
    ]);

    const componentUrl = `${componentJsUrl}?v=${componentEntry!.hash}`;
    const styleUrl     = `${prefix}/style?v=${styleEntry!.hash}`;
    const blocUrls     = blocSetEntry
        ? [`${prefix}/blocset?tags=${sortedTags.join(",")}&v=${blocSetEntry.hash}`]
        : [];
    const scriptUrls   = [componentUrl, ...blocUrls];

    return { componentUrl, styleUrl, blocUrls, scriptUrls };
}
