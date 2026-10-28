import { pageDocument, renderPageDocument } from "@bernouy/cms-content/rendering";
import { parseHTML } from "linkedom";
import type { TPage } from "@bernouy/cms-content/rendering";
import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";
import { injectBindingCloak, prepareNetworkInertBindings } from "@bernouy/cms-content/browser/dom";
import { buildHtmlBasics } from "cms-content/pages/delivery/html/head/buildHtmlBasics";

import { buildAssetPreloads, buildStylesheetLink } from "cms-content/pages/delivery/html/head/buildAssets";
import { buildScriptTags } from "cms-content/pages/delivery/html/head/buildScriptTags";
import { defineMetaTags, definePageStructuredData } from "@bernouy/cms-content/seo";
import type { RenderContext } from "cms-content/pages/delivery/html/RenderContext";
import { resolvePageMetadata, type PageRenderMetadata } from "@bernouy/cms-content/seo";
import { measureCurrentRequestTiming } from "@bernouy/http-runner/observability";

/**
 * Render a page to a compressed CacheEntry. Thin orchestrator — every piece
 * of `<head>` construction lives in a dedicated helper; this function only
 * fixes document order and wires the repository / context calls.
 *
 * <head> layout: preloads are emitted early so the browser starts
 * downloading the runtime + theme before reaching the deferred `<script>`
 * tags at the bottom. All scripts use `defer`, which keeps execution in
 * document order: `bloc-runtime.js` runs before any Bloc bundle, and the parser
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

    const storedSettings = ctx.renderingSettings ?? (await ctx.content.getRenderingSettings());
    const settings = runtimeMetadata.language
        ? { ...storedSettings, site: { ...storedSettings.site, language: runtimeMetadata.language } }
        : storedSettings;
    const metadata = resolvePageMetadata(page, settings, runtimeMetadata);

    const rendered = await measureCurrentRequestTiming("page_document", () =>
        renderPageDocument(document.body, pageDocument(page), {
            repository: ctx.content,
            language: settings.site.language || "en",
            resolveContributedAssets: ctx.resolveContributedAssets,
            resolveSvgSources: ctx.resolveSvgSources,
            // A browser may fetch an interpolated img src before the deferred
            // binding runtime executes. Keep those network attributes inert.
            prepareBody: async (body) => {
                await ctx.prepareBody?.(body);
                prepareNetworkInertBindings(body);
            },
        }),
    );
    const usedTags = [...rendered.usedTags];
    const assets = await measureCurrentRequestTiming("page_assets", () =>
        ctx.resolveAssets(usedTags, rendered.renderableBlocs, rendered.blocViews),
    );
    const requiresBindingRuntime = rendered.requiresBindingRuntime;

    buildHtmlBasics(document, head, settings);
    buildAssetPreloads(document, head, assets, { includeBindingCore: requiresBindingRuntime });
    if (requiresBindingRuntime) {
        injectBindingCloak(document);
    }
    defineMetaTags(
        document,
        head,
        page,
        settings,
        storedSettings.site?.favicon?.trim() || ctx.faviconUrl,
        metadata,
        storedSettings.site,
    );
    definePageStructuredData(document, head, settings, metadata);
    buildStylesheetLink(document, head, assets);
    buildScriptTags(document, head, assets, { includeBindingCore: requiresBindingRuntime });

    return compress(document.toString(), "text/html");
}
