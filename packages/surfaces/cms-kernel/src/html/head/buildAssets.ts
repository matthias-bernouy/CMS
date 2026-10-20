import type { AssetsManifest } from "@bernouy/cms-content/rendering";

/**
 * Preload the stylesheet + every bloc/runtime script as early as possible.
 * The speculative parser already does this for resources it discovers later
 * in the head, but explicit preloads make the priority hints deterministic
 * and survive edge cases (heavy inline content before the script tags).
 */
export function buildAssetPreloads(
    document: Document,
    head: HTMLElement,
    assets: AssetsManifest,
    options: { includeBindingCore?: boolean } = {},
): void {
    for (const href of new Set([assets.styleUrl, ...assets.blocStyleUrls])) {
        const stylePreload = document.createElement("link");
        stylePreload.setAttribute("rel", "preload");
        stylePreload.setAttribute("as", "style");
        stylePreload.setAttribute("href", href);
        head.appendChild(stylePreload);
    }

    const [blocRuntimeUrl, ...blocUrls] = assets.scriptUrls;
    const scriptUrls = options.includeBindingCore
        ? [...(blocRuntimeUrl ? [blocRuntimeUrl] : []), assets.bindingCoreUrl, ...blocUrls]
        : assets.scriptUrls;
    for (const src of new Set(scriptUrls)) {
        const preload = document.createElement("link");
        preload.setAttribute("rel", "preload");
        preload.setAttribute("as", "script");
        preload.setAttribute("href", src);
        head.appendChild(preload);
    }
}

/**
 * `<link rel="stylesheet">` entries for theme and Bloc CSS. Emitted late in `<head>`
 * (after preloads + meta tags) because the browser has already started the
 * download from the preload hint by the time it reaches this tag.
 */
export function buildStylesheetLink(document: Document, head: HTMLElement, assets: AssetsManifest): void {
    for (const href of new Set([assets.styleUrl, ...assets.blocStyleUrls])) {
        const link = document.createElement("link");
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("href", href);
        head.appendChild(link);
    }
}
