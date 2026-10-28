import { observeDelivery } from "./observe";
import {
    serveBlocSet,
    serveBlocStyles,
    serveThemeStyle,
    serveBindingCoreRuntime,
    serveBlocRuntime,
} from "@bernouy/cms-content/http";
import { servePublishedPageSnapshot, PUBLISHED_PAGE_SNAPSHOT_ROUTE } from "@bernouy/cms-content/rendering";
import { matchRootSitemapChunkPath } from "@bernouy/cms-content/seo";
import { createRobotsHandler, createSitemapChunkHandler, createSitemapHandler } from "@bernouy/cms-content/seo/http";
import { handlePageRequest } from "./http/pages/handlePageRequest";
import serveFavicon from "./http/assets/serveFavicon";
import { FAVICON_ROUTE } from "./http/assets/favicon";
import { parseResolvePathRequest, publicPathRequest } from "./resolvePathInput";
import type ContentDeliveryHost from "./interfaces";
import type { DeliveryActor } from "./interfaces";
import type { BlobStore } from "@bernouy/blob-store";

export interface ContentDeliveryOptions
    extends Omit<ContentDeliveryHost, "resolveActor" | "executeQuery" | "basePath" | "cmsPathPrefix"> {
    readonly publicUrl: string;
    readonly sitemapStore?: BlobStore;
    readonly serveCollectionAsset: (request: Request) => Promise<Response>;
    readonly guard?: (request: Request) => Promise<Response | null>;
}
/** Resolves the Content URL namespace inside its Provider, using only injected feature ports. */
export class ContentDelivery {
    constructor(private readonly options: ContentDeliveryOptions) {}
    async resolvePath(
        value: unknown,
        actor: DeliveryActor,
        executeQuery?: ContentDeliveryHost["executeQuery"],
    ): Promise<Response> {
        const input = parseResolvePathRequest(value);
        if (isProtocolPath(input.path)) {
            return new Response(input.method === "HEAD" ? null : "Not Found", {
                status: 404,
                headers: { "cache-control": "no-store" },
            });
        }
        const request = publicPathRequest(input, this.options.publicUrl);
        const host: ContentDeliveryHost = {
            ...this.options,
            basePath: "",
            cmsPathPrefix: "/_content",
            resolveActor: async () => actor,
            executeQuery,
        };
        const response =
            (await this.options.guard?.(request)) ??
            (await observeDelivery(host, "path.resolve", () => this.resolve(request, input.path, host)));
        const headers = new Headers(response.headers);
        if (actor.kind !== "anonymous") {
            headers.set("cache-control", "private, no-store");
        }
        if (!headers.has("cache-control")) {
            headers.set("cache-control", "no-store");
        }
        if (input.method === "HEAD") {
            await response.body?.cancel();
        }
        return new Response(input.method === "HEAD" ? null : response.body, { status: response.status, headers });
    }
    private async resolve(request: Request, path: string, host: ContentDeliveryHost): Promise<Response> {
        const { content, cache, logger, resolveContributedAssets } = host;
        const common = { content, cache, resolveContributedAssets };
        if (path === "/robots.txt") {
            return createRobotsHandler({
                content,
                basePath: "",
                cmsPathPrefix: "/.cms",
                collectionAssetsPath: "/_content/collections",
                publicRuntimePaths: [
                    "/_content/style",
                    "/_content/blocset",
                    "/_content/blocstyles",
                    "/_content/assets/bloc-runtime.js",
                    "/_content/assets/cms-binding-core.js",
                ],
                capabilityCallsEnabled: true,
                logger,
            })(request);
        }
        const store = this.options.sitemapStore;
        if (path === "/sitemap.xml") {
            return createSitemapHandler({ content, store, isReservedPath: isContentReservedPath, logger })(request);
        }
        if (matchRootSitemapChunkPath(path)) {
            return createSitemapChunkHandler({ store, basePath: "", logger })(request);
        }
        if (path === "/manifest.webmanifest") {
            const settings = await content.getRenderingSettings();
            return Response.json(
                {
                    name: settings.site.name,
                    lang: settings.site.language || "en",
                    start_url: "/",
                    display: "browser",
                    icons: [{ src: settings.site.favicon || FAVICON_ROUTE, sizes: "any" }],
                },
                { headers: { "content-type": "application/manifest+json", "cache-control": "public, no-cache" } },
            );
        }
        if (path === FAVICON_ROUTE) {
            return serveFavicon(request);
        }
        if (path === "/_content/style") {
            return serveThemeStyle(request, common);
        }
        if (path === "/_content/blocset") {
            return serveBlocSet(request, common);
        }
        if (path === "/_content/blocstyles") {
            return serveBlocStyles(request, common);
        }
        if (path === "/_content/assets/bloc-runtime.js") {
            return serveBlocRuntime(request, cache);
        }
        if (path === "/_content/assets/cms-binding-core.js") {
            return serveBindingCoreRuntime(request, cache);
        }
        if (path === PUBLISHED_PAGE_SNAPSHOT_ROUTE) {
            return servePublishedPageSnapshot(content, request);
        }
        if (path.startsWith("/_content/collections/")) {
            return this.options.serveCollectionAsset(request);
        }
        return handlePageRequest(request, host);
    }
}
export function isProtocolPath(path: string): boolean {
    return (
        path === "/.cms" ||
        path.startsWith("/.cms/") ||
        path === "/healthz" ||
        path === "/readyz" ||
        path.startsWith("/.well-known/oauth-")
    );
}
export function isContentReservedPath(path: string): boolean {
    return (
        isProtocolPath(path) ||
        path === "/_content" ||
        path.startsWith("/_content/") ||
        path === "/robots.txt" ||
        path === "/sitemap.xml" ||
        path === "/manifest.webmanifest" ||
        path === FAVICON_ROUTE ||
        Boolean(matchRootSitemapChunkPath(path))
    );
}
