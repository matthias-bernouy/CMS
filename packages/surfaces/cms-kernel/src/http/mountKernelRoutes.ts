import type KernelCms from "cms-kernel/KernelCms";
import { serveBlocSet } from "@bernouy/cms-content/http";
import serveFavicon from "cms-kernel/http/assets/serveFavicon";
import { serveBindingCoreRuntime, serveComponentRuntime } from "@bernouy/cms-content/http";
import {
    generateStyleEntry,
    CMS_CACHE_KEYS,
    PUBLISHED_PAGE_SNAPSHOT_ROUTE,
    servePublishedPageSnapshot,
} from "@bernouy/cms-content/rendering";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { CMS_CAPABILITY_CALL_ROUTE, createCapabilityHttpHandler } from "@bernouy/cms-gateway/http/handlers";
import { handlePageRequest } from "cms-kernel/http/pages/handlePageRequest";
import { FAVICON_ROUTE } from "cms-kernel/http/assets/favicon";
import { matchRootSitemapChunkPath } from "@bernouy/cms-seo";
import { createRobotsHandler, createSitemapChunkHandler, createSitemapHandler } from "@bernouy/cms-seo/http";
import {
    COLLECTION_ASSETS_ROUTE,
    createCollectionMaintenanceGuard,
    resolveInstalledCollectionAssets,
    serveInstalledCollectionAsset,
} from "@bernouy/cms-repository/collections/http";
import { resolveRequestActor } from "cms-kernel/http/pages/access/resolveRequestActor";
import { isKernelReservedPath } from "cms-kernel/http/pages/reservedPaths";

/**
 * Wire every Kernel endpoint onto `kernel.runner`. Called from the
 * `KernelCms` constructor — `new KernelCms(...)` is enough; consumers
 * don't call this directly. Routes are registered relative to the runner's
 * `basePath`, so whatever tenant prefix is scoped via `rootRunner.group(...)`
 * gets prepended automatically. Assets always sit under a `/.cms` sub-prefix
 * within the tenant; pages sit at the tenant root and fall through to the
 * default endpoint.
 *
 * Pages are served through the runner's default GET endpoint: any path that
 * doesn't match a specific route falls through to `handlePageRequest`, which
 * resolves projected content and either renders or 404s. No boot-time
 * hydration or mutable in-process route registry is involved.
 */
export function mountKernelRoutes(kernel: KernelCms) {
    const runner = kernel.runner;
    const robotsHandler = createRobotsHandler({
        content: kernel.content,
        cmsPathPrefix: kernel.cmsPathPrefix,
        collectionAssetsPath: `${kernel.basePath}${COLLECTION_ASSETS_ROUTE}`,
        publicRuntimePaths: [
            `${kernel.cmsPathPrefix}/style`,
            `${kernel.cmsPathPrefix}/blocset`,
            `${kernel.cmsPathPrefix}/assets/component.js`,
            `${kernel.cmsPathPrefix}/assets/cms-binding-core.js`,
        ],
        capabilityCallsEnabled: !!kernel.capabilityGateway,
    });
    const sitemapHandler = createSitemapHandler({
        content: kernel.content,
        store: kernel.sitemapStore,
        isReservedPath: (path) => isKernelReservedPath(path, kernel.cmsPathPrefix),
    });
    const sitemapChunkHandler = createSitemapChunkHandler({
        store: kernel.sitemapStore,
        basePath: kernel.basePath,
    });
    if (kernel.collections) {
        runner.use(
            createCollectionMaintenanceGuard({
                ...kernel.collections,
                basePath: kernel.basePath,
            }),
        );
    }

    runner.addEndpoint("GET", "/.cms/blocset", (request) =>
        serveBlocSet(request, {
            content: kernel.content,
            cache: kernel.cache,
            resolveContributedAssets: (input) =>
                resolveInstalledCollectionAssets(input, kernel.collectionAssets, kernel.basePath),
        }),
    );
    runner.addEndpoint("GET", "/.cms/assets/component.js", (request) => serveComponentRuntime(request, kernel.cache));
    runner.addEndpoint("GET", "/.cms/assets/cms-binding-core.js", (request) =>
        serveBindingCoreRuntime(request, kernel.cache),
    );
    runner.addEndpoint("GET", "/.cms/assets/favicon", (request) => serveFavicon(request, kernel));
    if (kernel.collectionAssets) {
        runner.group(COLLECTION_ASSETS_ROUTE, (assetsRunner) => {
            assetsRunner.setDefaultEndpoint("GET", (request) =>
                serveInstalledCollectionAsset(request, kernel.collectionAssets!, kernel.basePath),
            );
            assetsRunner.setDefaultEndpoint("HEAD", (request) =>
                serveInstalledCollectionAsset(request, kernel.collectionAssets!, kernel.basePath),
            );
        });
    }
    runner.addEndpoint("GET", PUBLISHED_PAGE_SNAPSHOT_ROUTE, (req) => servePublishedPageSnapshot(kernel.content, req));

    runner.addEndpoint("GET", "/robots.txt", robotsHandler);
    runner.addEndpoint("GET", "/sitemap.xml", sitemapHandler);
    runner.addEndpoint("GET", FAVICON_ROUTE, (request) => serveFavicon(request, kernel));
    runner.addEndpoint("HEAD", FAVICON_ROUTE, (request) => serveFavicon(request, kernel));

    // `generateStyleEntry` is the same producer `resolveAssets` uses for the
    // `?v=<hash>` link, so served bytes match. Source secrets stay unwired
    // unless the composition root explicitly provides a resolver; otherwise a
    // `secret`-sourced header yields a clean 500 and unconfigured sources
    // yields 501.
    runner.addEndpoint("GET", "/.cms/style", (req) =>
        cachedResponseAsync(
            req,
            CMS_CACHE_KEYS.STYLE,
            kernel.cache,
            async () => generateStyleEntry(kernel.content),
            publicAssetCacheControl(req),
        ),
    );

    if (kernel.capabilityGateway) {
        const capabilityHandler = createCapabilityHttpHandler({
            ...kernel.capabilityGateway,
            basePath: kernel.basePath,
            pageExecution: kernel.pageExecution,
            resolveActor: (request) => resolveRequestActor(kernel, request),
        });
        runner.group(CMS_CAPABILITY_CALL_ROUTE, (callRunner) => {
            for (const method of ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"] as const) {
                callRunner.setDefaultEndpoint(method, capabilityHandler);
            }
        });
    }

    runner.setDefaultEndpoint("GET", (req) =>
        isRootSitemapChunkRequest(req, kernel) ? sitemapChunkHandler(req) : handlePageRequest(req, kernel),
    );
    runner.setDefaultEndpoint("HEAD", async (req) =>
        withoutBody(
            await (isRootSitemapChunkRequest(req, kernel) ? sitemapChunkHandler(req) : handlePageRequest(req, kernel)),
        ),
    );
}

function isRootSitemapChunkRequest(request: Request, kernel: KernelCms): boolean {
    const pathname = new URL(request.url).pathname.slice(kernel.basePath.length);
    return !!matchRootSitemapChunkPath(pathname);
}

function withoutBody(response: Response): Response {
    return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}
