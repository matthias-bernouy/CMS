import type KernelCms from "cms-kernel/KernelCms";
import { serveBlocSet, serveBlocStyles, serveThemeStyle } from "@bernouy/cms-content/http";
import serveFavicon from "cms-kernel/http/assets/serveFavicon";
import { serveBindingCoreRuntime, serveBlocRuntime } from "@bernouy/cms-content/http";
import { PUBLISHED_PAGE_SNAPSHOT_ROUTE, servePublishedPageSnapshot } from "@bernouy/cms-content/rendering";
import {
    CMS_CAPABILITY_CALL_ROUTE,
    CMS_CAPABILITY_MUTATION_ROUTE,
    CMS_CAPABILITY_QUERY_ROUTE,
    createCapabilityHttpHandler,
    createCapabilityMutationHandler,
    createCapabilityQueryHandler,
} from "@bernouy/cms-gateway/http/handlers";
import { handlePageRequest } from "cms-kernel/http/pages/handlePageRequest";
import { FAVICON_ROUTE } from "cms-kernel/http/assets/favicon";
import { matchRootSitemapChunkPath } from "@bernouy/cms-content/seo";
import { COLLECTION_ASSETS_ROUTE, resolveInstalledCollectionAssets } from "@bernouy/cms-repository/collections/assets";
import {
    createCollectionMaintenanceGuard,
    serveInstalledCollectionAsset,
} from "@bernouy/cms-repository/collections/http";
import { resolveRequestActor } from "cms-kernel/http/pages/access/resolveRequestActor";
import { mountCmsMcpRoutes } from "cms-kernel/http/mcp/routes";
import { applySessionEffect } from "cms-kernel/http/session/applySessionEffect";

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
    if (kernel.mcpHandler) {
        mountCmsMcpRoutes(runner, kernel.mcpHandler);
    }
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
    runner.addEndpoint("GET", "/.cms/blocstyles", (request) =>
        serveBlocStyles(request, {
            content: kernel.content,
            cache: kernel.cache,
            resolveContributedAssets: (input) =>
                resolveInstalledCollectionAssets(input, kernel.collectionAssets, kernel.basePath),
        }),
    );
    runner.addEndpoint("GET", "/.cms/assets/bloc-runtime.js", (request) => serveBlocRuntime(request, kernel.cache));
    runner.addEndpoint("GET", "/.cms/assets/cms-binding-core.js", (request) =>
        serveBindingCoreRuntime(request, kernel.cache),
    );
    if (kernel.collectionAssets || kernel.collectionAssetHandler) {
        const handler = kernel.collectionAssetHandler;
        runner.group(COLLECTION_ASSETS_ROUTE, (assetsRunner) => {
            assetsRunner.setDefaultEndpoint("GET", (request) =>
                handler
                    ? handler(request)
                    : serveInstalledCollectionAsset(request, kernel.collectionAssets!, kernel.basePath),
            );
            assetsRunner.setDefaultEndpoint("HEAD", (request) =>
                handler
                    ? handler(request)
                    : serveInstalledCollectionAsset(request, kernel.collectionAssets!, kernel.basePath),
            );
        });
    }
    runner.addEndpoint("GET", PUBLISHED_PAGE_SNAPSHOT_ROUTE, (req) => servePublishedPageSnapshot(kernel.content, req));
    runner.addEndpoint("GET", "/robots.txt", kernel.robotsHandler);
    runner.addEndpoint("GET", "/sitemap.xml", kernel.sitemapHandler);
    runner.addEndpoint("GET", FAVICON_ROUTE, serveFavicon);
    runner.addEndpoint("HEAD", FAVICON_ROUTE, serveFavicon);

    runner.addEndpoint("GET", "/.cms/style", (request) =>
        serveThemeStyle(request, {
            content: kernel.content,
            cache: kernel.cache,
            resolveContributedAssets: (input) =>
                resolveInstalledCollectionAssets(input, kernel.collectionAssets, kernel.basePath),
        }),
    );

    if (kernel.capabilityGateway || kernel.capabilityHandler) {
        const capabilityHandler =
            kernel.capabilityHandler ??
            createCapabilityHttpHandler({
                ...kernel.capabilityGateway!,
                basePath: kernel.basePath,
                resolveActor: (request) => resolveRequestActor(kernel, request),
            });
        runner.group(CMS_CAPABILITY_CALL_ROUTE, (callRunner) => {
            for (const method of ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"] as const) {
                callRunner.setDefaultEndpoint(method, async (request) =>
                    applySessionEffect(await capabilityHandler(request), kernel.sessionCookie),
                );
            }
        });
    }
    if (kernel.queryHandler || kernel.capabilityGateway?.resolveCapability) {
        const queryHandler =
            kernel.queryHandler ??
            createCapabilityQueryHandler({
                ...kernel.capabilityGateway!,
                resolveCapability: kernel.capabilityGateway!.resolveCapability!,
                basePath: kernel.basePath,
                resolveActor: (request) => resolveRequestActor(kernel, request),
            });
        runner.group(CMS_CAPABILITY_QUERY_ROUTE, (queryRunner) => {
            queryRunner.setDefaultEndpoint("GET", async (request) =>
                applySessionEffect(await queryHandler(request), kernel.sessionCookie),
            );
            queryRunner.setDefaultEndpoint("QUERY", async (request) =>
                applySessionEffect(await queryHandler(request), kernel.sessionCookie),
            );
        });
    }
    if (kernel.mutationHandler || kernel.capabilityGateway?.resolveCapability) {
        const mutationHandler =
            kernel.mutationHandler ??
            createCapabilityMutationHandler({
                ...kernel.capabilityGateway!,
                resolveCapability: kernel.capabilityGateway!.resolveCapability!,
                basePath: kernel.basePath,
                resolveActor: (request) => resolveRequestActor(kernel, request),
                onSuccess: kernel.capabilityGateway!.onMutationSuccess,
            });
        runner.group(CMS_CAPABILITY_MUTATION_ROUTE, (mutationRunner) => {
            mutationRunner.setDefaultEndpoint("POST", async (request) =>
                applySessionEffect(await mutationHandler(request), kernel.sessionCookie),
            );
        });
    }

    runner.setDefaultEndpoint("GET", (req) =>
        isRootSitemapChunkRequest(req, kernel) ? kernel.sitemapChunkHandler(req) : handlePageRequest(req, kernel),
    );
    runner.setDefaultEndpoint("HEAD", async (req) =>
        withoutBody(
            await (isRootSitemapChunkRequest(req, kernel)
                ? kernel.sitemapChunkHandler(req)
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
