import type { AssetsManifest } from "cms-delivery/core/assets/resolveAssets";

/**
 * Deferred `<script>` tags — downloaded in parallel, executed in document
 * order after HTML parsing. `component.js` is emitted first (see
 * `assets.scriptUrls`) so every bloc IIFE can read `window.p9r.Component`
 * at execution time.
 */
export function buildScriptTags(
    document: Document,
    head: HTMLElement,
    assets: AssetsManifest,
    options: { includeBindingCore?: boolean } = {},
): void {
    const [componentUrl, ...blocUrls] = assets.scriptUrls;
    const urls = [
        ...(componentUrl ? [componentUrl] : []),
        ...(options.includeBindingCore ? [assets.bindingCoreUrl] : []),
        ...blocUrls,
    ];
    for (const src of urls) {
        const script = document.createElement("script");
        script.setAttribute("defer", "");
        script.setAttribute("src", src);
        head.appendChild(script);
    }
}
