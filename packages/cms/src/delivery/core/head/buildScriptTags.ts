import type { AssetsManifest } from "src/delivery/core/assets/resolveAssets";

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
): void {
    for (const src of assets.scriptUrls) {
        const script = document.createElement("script");
        script.setAttribute("defer", "");
        script.setAttribute("src",   src);
        head.appendChild(script);
    }
}
