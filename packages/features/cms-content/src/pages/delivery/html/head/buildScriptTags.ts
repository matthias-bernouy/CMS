import type { AssetsManifest } from "@bernouy/cms-content/rendering";

/**
 * Deferred `<script>` tags — downloaded in parallel, executed in document
 * order after HTML parsing. `bloc-runtime.js` is emitted first (see
 * `assets.scriptUrls`) so every Bloc bundle can read the shared Light DOM runtime
 * at execution time.
 */
export function buildScriptTags(
    document: Document,
    head: HTMLElement,
    assets: AssetsManifest,
    options: { includeBindingCore?: boolean } = {},
): void {
    const [blocRuntimeUrl, ...blocUrls] = assets.scriptUrls;
    const urls = [
        ...(blocRuntimeUrl ? [blocRuntimeUrl] : []),
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
