import type { AssetsManifest } from "cms-delivery/core/assets/resolveAssets";
import { buildBlocFoucShellCss } from "@bernouy/cms-content";

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
    const stylePreload = document.createElement("link");
    stylePreload.setAttribute("rel", "preload");
    stylePreload.setAttribute("as", "style");
    stylePreload.setAttribute("href", assets.styleUrl);
    head.appendChild(stylePreload);

    const scriptUrls = options.includeBindingCore ? [...assets.scriptUrls, assets.bindingCoreUrl] : assets.scriptUrls;
    for (const src of new Set(scriptUrls)) {
        const preload = document.createElement("link");
        preload.setAttribute("rel", "preload");
        preload.setAttribute("as", "script");
        preload.setAttribute("href", src);
        head.appendChild(preload);
    }
}

/** Hide binding-owned source bodies before the deferred binding runtime starts. */
export function buildBindingCloak(document: Document, head: HTMLElement, enabled: boolean): void {
    if (!enabled) {
        return;
    }
    const style = document.createElement("style");
    style.id = "cms-binding-cloak";
    style.textContent = "cms-binding-core{display:contents}[cms-source]:not([cms-ready]){visibility:hidden}";
    head.appendChild(style);
}

/**
 * Progressive Bloc shell: undefined custom-element hosts stay layout-neutral
 * while their server-rendered Light DOM remains visible. Once registered, the
 * component's own display and Shadow DOM styling take over.
 */
export function buildFoucShell(document: Document, head: HTMLElement, usedTags: string[]): void {
    const css = buildBlocFoucShellCss(usedTags);
    if (!css) {
        return;
    }

    const style = document.createElement("style");
    style.textContent = css;
    head.appendChild(style);
}

/**
 * `<link rel="stylesheet">` for the theme CSS. Emitted late in `<head>`
 * (after preloads + meta tags) because the browser has already started the
 * download from the preload hint by the time it reaches this tag.
 */
export function buildStylesheetLink(document: Document, head: HTMLElement, assets: AssetsManifest): void {
    const link = document.createElement("link");
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", assets.styleUrl);
    head.appendChild(link);
}
