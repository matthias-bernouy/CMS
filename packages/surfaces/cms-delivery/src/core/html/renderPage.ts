import { pageDocument, renderPageDocument } from "@bernouy/cms-content/rendering";
import { parseHTML } from "linkedom";
import type { TPage } from "@bernouy/cms-content/rendering";
import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";
import { injectMediaVersions } from "@bernouy/cms-content/files/serving";
import { prepareNetworkInertBindings } from "@bernouy/cms-content/browser/dom";
import { buildHtmlBasics } from "cms-delivery/core/head/buildHtmlBasics";
import { buildMetaCsp } from "cms-delivery/core/head/buildMetaCsp";
import {
    buildAssetPreloads,
    buildBindingCloak,
    buildFoucShell,
    buildStylesheetLink,
} from "cms-delivery/core/head/buildAssets";
import { buildPreconnect } from "cms-delivery/core/head/buildPreconnect";
import { buildScriptTags } from "cms-delivery/core/head/buildScriptTags";
import { defineMetaTags } from "cms-delivery/core/seo/defineMetaTags";
import { definePageStructuredData } from "cms-delivery/core/seo/pageStructuredData";
import type { RenderContext } from "cms-delivery/core/html/RenderContext";
import { resolvePageMetadata, type PageRenderMetadata } from "cms-delivery/core/seo/pageMetadata";

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
export async function renderPage(
    page: TPage,
    ctx: RenderContext,
    runtimeMetadata: PageRenderMetadata = {},
): Promise<CacheEntry> {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    const head = document.head;

    const storedSettings = await ctx.repository.getRenderingSettings();
    const settings = runtimeMetadata.language
        ? { ...storedSettings, site: { ...storedSettings.site, language: runtimeMetadata.language } }
        : storedSettings;
    const metadata = resolvePageMetadata(page, settings, runtimeMetadata);

    const rendered = await renderPageDocument(document.body, pageDocument(page), {
        repository: ctx.repository,
        language: settings.site.language || "en",
        collectionTexts: ctx.collectionTexts,
        resolveCollectionAssets: ctx.resolveCollectionAssets,
        // A browser may fetch an interpolated img src before the deferred
        // binding runtime executes. Keep those network attributes inert.
        prepareBody: prepareNetworkInertBindings,
    });
    const usedTags = [...rendered.usedTags];
    const assets = await ctx.resolveAssets(usedTags);
    const hasBindingCore = rendered.hasBindingCore;

    // Whitelist asset hosts in CSP. When the build pipeline pre-uploads CSS
    // / JS to a public CDN whose host differs from the page's serving host
    // (typical when an alias domain points at the bucket), absolute asset
    // URLs would otherwise be blocked by `style-src 'self'` /
    // `default-src 'self'`. Same-origin assets contribute nothing — the
    // unique-host set naturally drops them via Set semantics.
    const styleHosts = uniqueOrigins([assets.styleUrl]);
    const scriptHosts = uniqueOrigins([...assets.scriptUrls, ...(hasBindingCore ? [assets.bindingCoreUrl] : [])]);
    const cspExtras = {
        connectExtras: [...settings.security.connectExtras],
        mediaExtras: [...settings.security.mediaExtras],
        styleExtras: styleHosts,
        scriptExtras: scriptHosts,
        frameExtras: [],
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
    buildHtmlBasics(document, head, settings);
    buildMetaCsp(document, head, cspExtras);
    for (const inject of ctx.headInjectors) {
        inject({ document, head, metadata, usedTags });
    }
    buildPreconnect(document, head);
    buildAssetPreloads(document, head, assets, { includeBindingCore: hasBindingCore });
    buildBindingCloak(document, head, hasBindingCore);
    buildFoucShell(document, head, usedTags);
    defineMetaTags(document, head, page, settings, ctx.faviconUrl, metadata, storedSettings.site);
    definePageStructuredData(document, head, settings, metadata);
    buildStylesheetLink(document, head, assets);
    buildScriptTags(document, head, assets, { includeBindingCore: hasBindingCore });

    // Stamp every by-id media URL with `?v=<contentHash>` (cache bust), expand
    // raster <img>s whose variants are ready into responsive srcsets, and collect
    // the rest for background optimization (served as originals until ready).
    const unoptimized = await injectMediaVersions(document, {
        files: ctx.filesMetadata,
        variantStore: ctx.variantStore,
    });
    if (unoptimized.length > 0) {
        ctx.optimizePage?.(page.path, unoptimized);
    }

    return compress(document.toString(), "text/html");
}

function uniqueOrigins(urls: string[]): string[] {
    const out = new Set<string>();
    for (const u of urls) {
        try {
            out.add(new URL(u).origin);
        } catch {
            /* relative URL → no origin to whitelist */
        }
    }
    return [...out];
}
