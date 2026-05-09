import { parseHTML } from "linkedom";
import type { TPage } from "src/socle/interfaces/models";
import type { CacheEntry } from "src/socle/interfaces/Cache";
import { compress } from "src/socle/server/compression";
import { expandSnippets } from "src/delivery/core/html/expandSnippets";
import { findUsedBlocTags } from "src/delivery/core/blocs/findUsedBlocs";
import { buildHtmlBasics } from "src/delivery/core/head/buildHtmlBasics";
import { buildMetaCsp } from "src/delivery/core/head/buildMetaCsp";
import { buildAssetPreloads, buildFoucShell, buildStylesheetLink } from "src/delivery/core/head/buildAssets";
import { buildPreconnect } from "src/delivery/core/head/buildPreconnect";
import { buildScriptTags } from "src/delivery/core/head/buildScriptTags";
import { defineMetaTags } from "src/delivery/core/seo/defineMetaTags";
import type { RenderContext } from "src/delivery/core/html/RenderContext";

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
    const cspExtras = {
        connectExtras: [...settings.security.connectExtras],
        mediaExtras:   [...settings.security.mediaExtras],
    };

    const expandedContent = await expandSnippets(page.content, ctx.repository);
    document.body.innerHTML = expandedContent;

    const blocList = await ctx.repository.getBlocsList();
    const usedTags = findUsedBlocTags(expandedContent, blocList);
    const assets   = await ctx.resolveAssets(usedTags);

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

    return compress(document.toString(), "text/html");
}
