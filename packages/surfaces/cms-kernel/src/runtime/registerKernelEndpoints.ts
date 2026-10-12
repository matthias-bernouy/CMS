import type KernelCms from "cms-kernel/KernelCms";
import BlocServer from "cms-kernel/endpoints/bloc.server";
import BlocSetServer from "cms-kernel/endpoints/blocset.server";
import RobotsServer from "cms-kernel/endpoints/robots.txt.server";
import SitemapServer from "cms-kernel/endpoints/sitemap.xml.server";
import SitemapChunkServer from "cms-kernel/endpoints/sitemap-chunk.server";
import FaviconServer from "cms-kernel/endpoints/assets/favicon.server";
import { handleCapabilityCall } from "cms-kernel/endpoints/capabilityCall.server";
import ComponentServer from "cms-kernel/endpoints/assets/component.server";
import BindingCoreServer from "cms-kernel/endpoints/assets/bindingCore.server";
import {
    generateStyleEntry,
    CMS_CACHE_KEYS,
    PUBLISHED_PAGE_SNAPSHOT_ROUTE,
    servePublishedPageSnapshot,
} from "@bernouy/cms-content/rendering";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { CMS_CAPABILITY_CALL_ROUTE } from "@bernouy/cms-gateway/http/handlers";
import { handlePageRequest } from "cms-kernel/core/pages/handlePageRequest";
import { FAVICON_ROUTE } from "cms-kernel/core/assets/defaultFavicon";
import { matchRootSitemapChunkPath } from "cms-kernel/core/seo/sitemap/manifest";
import { createKernelMaintenanceGuard } from "cms-kernel/core/maintenance";
import CollectionAssetServer from "cms-kernel/endpoints/assets/collectionAsset.server";
import { COLLECTION_ASSETS_ROUTE } from "cms-kernel/core/assets/collectionAssets";

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
export function registerKernelEndpoints(kernel: KernelCms) {
    const runner = kernel.runner;
    runner.use(createKernelMaintenanceGuard(kernel));

    runner.addEndpoint("GET", "/.cms/bloc", (req) => BlocServer(req, kernel));
    runner.addEndpoint("GET", "/.cms/blocset", (req) => BlocSetServer(req, kernel));
    runner.addEndpoint("GET", "/.cms/assets/component.js", (req) => ComponentServer(req, kernel));
    runner.addEndpoint("GET", "/.cms/assets/cms-binding-core.js", (req) => BindingCoreServer(req, kernel));
    runner.addEndpoint("GET", "/.cms/assets/favicon", (req) => FaviconServer(req, kernel));
    runner.group(COLLECTION_ASSETS_ROUTE, (assetsRunner) => {
        assetsRunner.setDefaultEndpoint("GET", (req) => CollectionAssetServer(req, kernel));
        assetsRunner.setDefaultEndpoint("HEAD", (req) => CollectionAssetServer(req, kernel));
    });
    runner.addEndpoint("GET", PUBLISHED_PAGE_SNAPSHOT_ROUTE, (req) =>
        servePublishedPageSnapshot(kernel.repository, req),
    );

    runner.addEndpoint("GET", "/robots.txt", (req) => RobotsServer(req, kernel));
    runner.addEndpoint("GET", "/sitemap.xml", (req) => SitemapServer(req, kernel));
    runner.addEndpoint("GET", FAVICON_ROUTE, (req) => FaviconServer(req, kernel));
    runner.addEndpoint("HEAD", FAVICON_ROUTE, (req) => FaviconServer(req, kernel));

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
            async () => generateStyleEntry(kernel.repository),
            publicAssetCacheControl(req),
        ),
    );

    if (kernel.capabilityGateway) {
        runner.group(CMS_CAPABILITY_CALL_ROUTE, (callRunner) => {
            for (const method of ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"] as const) {
                callRunner.setDefaultEndpoint(method, (request) => handleCapabilityCall(request, kernel));
            }
        });
    }

    runner.setDefaultEndpoint("GET", (req) =>
        isRootSitemapChunkRequest(req, kernel) ? SitemapChunkServer(req, kernel) : handlePageRequest(req, kernel),
    );
    runner.setDefaultEndpoint("HEAD", async (req) =>
        withoutBody(
            await (isRootSitemapChunkRequest(req, kernel)
                ? SitemapChunkServer(req, kernel)
                : handlePageRequest(req, kernel)),
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
