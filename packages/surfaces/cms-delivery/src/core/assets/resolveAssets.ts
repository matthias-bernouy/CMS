import type DeliveryCms from "cms-delivery/DeliveryCms";
import { getOrGenerateEntryAsync } from "@bernouy/http-runner";
import { getBlocGroupManifest } from "cms-delivery/core/blocs/blocGroupManifest";
import { generateBlocSetEntry, generateStyleEntry } from "@bernouy/cms-content";
import { componentJsCacheKey, generateComponentJsEntry } from "cms-delivery/core/assets/buildComponent";
import { generateBindingCoreJsEntry } from "cms-delivery/core/assets/buildBindingCore";
import { P9R_CACHE } from "@bernouy/cms-content";
import {
    collectIntegrationInstallationThemeContributions,
    type IntegrationInstallationRepository,
} from "@bernouy/cms-integrations";

/**
 * Content-addressed URLs for every asset a page references. The hash is the
 * entry's sha256 digest — a content change produces a new hash, hence a new
 * URL, which lets the endpoints serve these assets with `Cache-Control:
 * immutable` (1-year browser cache, zero revalidation).
 */
export type AssetsManifest = {
    componentUrl: string;
    /** System bloc: the data-binding activation root. Resolved on every page;
     *  `renderPage` injects its `<script>` only when the composed HTML uses
     *  the `<cms-binding-core>` tag (default Shell does; a custom one may not). */
    bindingCoreUrl: string;
    styleUrl: string;
    /** The bloc-bundle URL(s) covering the page's blocs — one `/blocset`
     *  bundle today (the page's exact set); becomes several stable group
     *  URLs once blocs are grouped by signature. */
    blocUrls: string[];
    /** `[componentUrl, ...blocUrls]` — convenience for emission in order. */
    scriptUrls: string[];
};

/**
 * Runtime asset resolution: warms the delivery cache on miss and produces
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
export async function resolveRuntimeAssets(delivery: DeliveryCms, usedTags: string[]): Promise<AssetsManifest> {
    const prefix = delivery.cmsPathPrefix;
    const componentJsUrl = `${prefix}/assets/component.js`;
    const componentCacheKey = componentJsCacheKey(componentJsUrl, delivery.responsiveSourceImageRollout);
    const bindingCoreJsUrl = `${prefix}/assets/cms-binding-core.js`;
    const bindingCoreJsCacheKey = P9R_CACHE.js(bindingCoreJsUrl);

    // Partition the page's blocs into the stable signature groups that cover
    // them + a fallback bundle for any tag the manifest doesn't know yet.
    const manifest = await getBlocGroupManifest(delivery);
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

    const [componentEntry, bindingCoreEntry, styleEntry, ...bundleEntries] = await Promise.all([
        getOrGenerateEntryAsync(componentCacheKey, delivery.cache, () =>
            generateComponentJsEntry(delivery.responsiveSourceImageRollout),
        ),
        getOrGenerateEntryAsync(bindingCoreJsCacheKey, delivery.cache, generateBindingCoreJsEntry),
        getOrGenerateEntryAsync(P9R_CACHE.STYLE, delivery.cache, async () =>
            generateStyleEntry(
                delivery.repository,
                await getDeliveryIntegrationThemeContributions(delivery.integrationInstallations),
            ),
        ),
        ...bundles.map((tags) =>
            getOrGenerateEntryAsync(P9R_CACHE.blocset(tags), delivery.cache, () =>
                generateBlocSetEntry(tags, delivery.repository),
            ),
        ),
    ]);

    const componentUrl = `${componentJsUrl}?v=${componentEntry!.hash}`;
    const bindingCoreUrl = `${bindingCoreJsUrl}?v=${bindingCoreEntry!.hash}`;
    const styleUrl = `${prefix}/style?v=${styleEntry!.hash}`;
    const blocAssets = bundles
        .map((tags, i) => ({ tags, entry: bundleEntries[i]! }))
        .filter((asset) => asset.entry.raw.length > 0);
    const blocUrls = blocAssets.map(
        ({ tags, entry }) => `${prefix}/blocset?tags=${[...tags].sort().join(",")}&v=${entry.hash}`,
    );
    const scriptUrls = [componentUrl, ...blocUrls];

    return { componentUrl, bindingCoreUrl, styleUrl, blocUrls, scriptUrls };
}

export async function getDeliveryIntegrationThemeContributions(
    installations: IntegrationInstallationRepository | undefined,
) {
    return installations ? collectIntegrationInstallationThemeContributions(await installations.list()) : [];
}
