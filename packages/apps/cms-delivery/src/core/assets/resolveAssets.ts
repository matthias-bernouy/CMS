import type DeliveryCms from "cms-delivery/DeliveryCms";
import { getOrGenerateEntryAsync } from "@bernouy/cms-shared";
import { generateBlocEntry } from "cms-delivery/core/blocs/buildBloc";
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
    /** Parallel array with the `usedTags` passed in. */
    blocUrls:     string[];
    /** `[componentUrl, ...blocUrls]` — convenience for emission in order. */
    scriptUrls:   string[];
};

/**
 * Runtime asset resolution: warms the delivery cache on miss and produces
 * hashed URLs under `<cmsPathPrefix>/`. Used by the live serving path; the
 * build pipeline has its own resolver that uploads to the CDN instead.
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

    const [componentEntry, styleEntry, ...blocEntries] = await Promise.all([
        getOrGenerateEntryAsync(componentJsCacheKey, delivery.cache, generateComponentJsEntry),
        getOrGenerateEntryAsync(P9R_CACHE.STYLE,     delivery.cache, () => generateStyleEntry(delivery.repository)),
        ...usedTags.map(tag => getOrGenerateEntryAsync(
            P9R_CACHE.bloc(tag), delivery.cache, () => generateBlocEntry(tag, delivery.repository),
        )),
    ]);

    const componentUrl = `${componentJsUrl}?v=${componentEntry!.hash}`;
    const styleUrl     = `${prefix}/style?v=${styleEntry!.hash}`;
    const blocUrls     = usedTags.map((tag, i) => `${prefix}/bloc?tag=${tag}&v=${blocEntries[i]!.hash}`);
    const scriptUrls   = [componentUrl, ...blocUrls];

    return { componentUrl, styleUrl, blocUrls, scriptUrls };
}
