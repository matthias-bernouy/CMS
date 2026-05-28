import type { AssetsManifest } from "src/delivery/core/assets/resolveAssets";

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
): void {
    const stylePreload = document.createElement("link");
    stylePreload.setAttribute("rel",  "preload");
    stylePreload.setAttribute("as",   "style");
    stylePreload.setAttribute("href", assets.styleUrl);
    head.appendChild(stylePreload);

    for (const src of assets.scriptUrls) {
        const preload = document.createElement("link");
        preload.setAttribute("rel",  "preload");
        preload.setAttribute("as",   "script");
        preload.setAttribute("href", src);
        head.appendChild(preload);
    }
}

/**
 * Anti-FOUC shell: while any bloc custom element on the page is still
 * undefined (JS not yet executed), hide the body entirely and paint a
 * plain white page. As soon as every bloc registers its tag the `:has`
 * rules stop matching and the real content flips in at its final layout
 * — no partial-render jump. Scoped to the blocs actually present on this
 * page so unrelated custom elements don't freeze the paint.
 */
export function buildFoucShell(
    document: Document,
    head: HTMLElement,
    usedTags: string[],
): void {
    if (usedTags.length === 0) return;

    const htmlSel = usedTags.map(tag => `html:has(${tag}:not(:defined))`).join(",");
    const bodySel = usedTags.map(tag => `html:has(${tag}:not(:defined)) body`).join(",");
    const style = document.createElement("style");
    style.textContent = `${htmlSel}{background:#fff}${bodySel}{visibility:hidden}`;
    head.appendChild(style);
}

/**
 * `<link rel="stylesheet">` for the theme CSS. Emitted late in `<head>`
 * (after preloads + meta tags) because the browser has already started the
 * download from the preload hint by the time it reaches this tag.
 */
export function buildStylesheetLink(
    document: Document,
    head: HTMLElement,
    assets: AssetsManifest,
): void {
    const link = document.createElement("link");
    link.setAttribute("rel",  "stylesheet");
    link.setAttribute("href", assets.styleUrl);
    head.appendChild(link);
}
