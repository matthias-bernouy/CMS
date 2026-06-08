import { parseHTML } from "linkedom";
import type { TPage } from "@bernouy/cms-shared";
import type { CacheEntry } from "@bernouy/cms-shared";
import { compress, sanitizeDomTree } from "@bernouy/cms-shared";
import { expandSnippets } from "cms-delivery/core/html/expandSnippets";
import { findUsedBlocTags } from "cms-delivery/core/blocs/findUsedBlocs";
import { buildHtmlBasics } from "cms-delivery/core/head/buildHtmlBasics";
import { buildMetaCsp } from "cms-delivery/core/head/buildMetaCsp";
import { buildAssetPreloads, buildFoucShell, buildStylesheetLink } from "cms-delivery/core/head/buildAssets";
import { buildPreconnect } from "cms-delivery/core/head/buildPreconnect";
import { buildScriptTags } from "cms-delivery/core/head/buildScriptTags";
import { defineMetaTags } from "cms-delivery/core/seo/defineMetaTags";
import { injectMediaVersions } from "cms-delivery/core/html/injectMediaVersions";
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

    const expandedContent = await expandSnippets(page.content, ctx.repository);
    document.body.innerHTML = expandedContent;
    // Authoritative stored-XSS guard at the actual innerHTML sink: strip
    // scripts / on* handlers / dangerous URL schemes from the parsed tree
    // before this HTML reaches a public visitor, whatever path stored it.
    sanitizeDomTree(document.body);

    const blocList = await ctx.repository.getBlocsList();
    const usedTags = findUsedBlocTags(expandedContent, blocList);
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

    // Stamp every by-id media URL (body <img>, favicon <link>) with its current
    // content hash (`?v=`) so an in-place file update busts the immutable cache.
    await injectMediaVersions(document, ctx.filesMetadata);

    return compress(document.toString(), "text/html");
}

function uniqueOrigins(urls: string[]): string[] {
    const out = new Set<string>();
    for (const u of urls) {
        try { out.add(new URL(u).origin); } catch { /* relative URL → no origin to whitelist */ }
    }
    return [...out];
}
