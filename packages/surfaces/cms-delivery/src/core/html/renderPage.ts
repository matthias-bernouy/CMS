import { parseHTML } from "linkedom";
import type { TPage } from "@bernouy/cms-content";
import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";
import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import { sanitizeDomTree, wrapBindingCore } from "@bernouy/cms-content";
import { injectMediaVersions } from "@bernouy/cms-files";
import { findUsedBlocTags } from "@bernouy/cms-content";
import { buildHtmlBasics } from "cms-delivery/core/head/buildHtmlBasics";
import { buildMetaCsp } from "cms-delivery/core/head/buildMetaCsp";
import { buildAssetPreloads, buildFoucShell, buildStylesheetLink } from "cms-delivery/core/head/buildAssets";
import { buildPreconnect } from "cms-delivery/core/head/buildPreconnect";
import { buildScriptTags } from "cms-delivery/core/head/buildScriptTags";
import { defineMetaTags } from "cms-delivery/core/seo/defineMetaTags";
import type { RenderContext } from "cms-delivery/core/html/RenderContext";

/**
 * Render a page to a compressed CacheEntry. Thin orchestrator — every piece
 * of `<head>` construction lives in a dedicated helper; this function only
 * fixes document order and wires the repository / context calls.
 *
 * <head> layout: preloads are emitted early so the browser starts
 * downloading the runtime + theme before reaching the deferred `<script>`
 * tags at the bottom. All scripts use `defer`, which keeps execution in
 * document order: `component.js` runs before any bloc IIFE, and the parser
 * is never blocked.
 *
 * `ctx.resolveAssets` is the strategy seam — runtime serves through the
 * cache, build pre-uploads to the CDN. The renderer doesn't care.
 */
export async function renderPage(page: TPage, ctx: RenderContext): Promise<CacheEntry> {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    const head = document.head;

    const settings = await ctx.repository.getSystem();

    const composed = wrapBindingCore(page.content);

    document.body.innerHTML = composed;
    // Authoritative stored-XSS guard at the actual innerHTML sink: strip
    // scripts / on* handlers / dangerous URL schemes from the parsed tree
    // before this HTML reaches a public visitor, whatever path stored it.
    sanitizeDomTree(document.body);

    const blocList = await ctx.repository.getBlocsList();
    const usedTags = findUsedBlocTags(composed, blocList);
    const assets   = await ctx.resolveAssets(usedTags);

    // Whitelist asset hosts in CSP. When the build pipeline pre-uploads CSS
    // / JS to a public CDN whose host differs from the page's serving host
    // (typical when an alias domain points at the bucket), absolute asset
    // URLs would otherwise be blocked by `style-src 'self'` /
    // `default-src 'self'`. Same-origin assets contribute nothing — the
    // unique-host set naturally drops them via Set semantics.
    const styleHosts  = uniqueOrigins([assets.styleUrl]);
    const scriptHosts = uniqueOrigins(assets.scriptUrls);
    const cspExtras = {
        connectExtras: [...settings.security.connectExtras],
        mediaExtras:   [...settings.security.mediaExtras],
        styleExtras:   styleHosts,
        scriptExtras:  scriptHosts,
    };

    // <head> assembly, in exact document order. Consumer-supplied head
    // injectors run right after the document basics so they land before any
    // preload/meta/stylesheet/deferred-script that the rest of the pipeline
    // adds — that ordering matters for parser-blocking scripts (e.g. an
    // observability agent that must monkeypatch `customElements.define`
    // before any deferred bloc IIFE registers its tag).
    //
    // `buildMetaCsp` is `prepend`ed inside the helper so it ends up FIRST
    // regardless of the call order here — meta-borne CSP only governs
    // resources requested AFTER its position in the document.
    buildHtmlBasics    (document, head, settings);
    buildMetaCsp       (document, head, cspExtras);
    for (const inject of ctx.headInjectors) inject({ document, head, usedTags });
    buildPreconnect    (document, head);
    buildAssetPreloads (document, head, assets);
    buildFoucShell     (document, head, usedTags);
    defineMetaTags     (document, head, page, settings, ctx.defaultFaviconUrl);
    buildStylesheetLink(document, head, assets);
    buildScriptTags    (document, head, assets);

    // System bloc: load the data-binding runtime only when the page uses the
    // activation root. Pages are wrapped by default for now.
    // Same-origin script → no CSP host to whitelist.
    if (document.querySelector(CMS_BINDING_CORE_TAG)) {
        const bindingCoreScript = document.createElement("script");
        bindingCoreScript.setAttribute("defer", "");
        bindingCoreScript.setAttribute("src", assets.bindingCoreUrl);
        head.appendChild(bindingCoreScript);
    }

    // Stamp every by-id media URL with `?v=<contentHash>` (cache bust), expand
    // raster <img>s whose variants are ready into responsive srcsets, and collect
    // the rest for background optimization (served as originals until ready).
    const unoptimized = await injectMediaVersions(document, { files: ctx.filesMetadata, variantStore: ctx.variantStore });
    if (unoptimized.length > 0) ctx.optimizePage?.(page.path, unoptimized);

    return compress(document.toString(), "text/html");
}

function uniqueOrigins(urls: string[]): string[] {
    const out = new Set<string>();
    for (const u of urls) {
        try { out.add(new URL(u).origin); } catch { /* relative URL → no origin to whitelist */ }
    }
    return [...out];
}
