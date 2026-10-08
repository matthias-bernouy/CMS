import type DeliveryCms from "cms-delivery/DeliveryCms";
import BlocServer from "cms-delivery/endpoints/bloc.server";
import BlocSetServer from "cms-delivery/endpoints/blocset.server";
import RobotsServer from "cms-delivery/endpoints/robots.txt.server";
import SitemapServer from "cms-delivery/endpoints/sitemap.xml.server";
import SitemapChunkServer from "cms-delivery/endpoints/sitemap-chunk.server";
import FaviconServer from "cms-delivery/endpoints/assets/favicon.server";
import { handleCapabilityCall } from "cms-delivery/endpoints/capabilityCall.server";
import ComponentServer from "cms-delivery/endpoints/assets/component.server";
import BindingCoreServer from "cms-delivery/endpoints/assets/bindingCore.server";
import { PUBLIC_AUTH_ROUTES, registerPublicAuthRoutes } from "@bernouy/cms-auth/http";
import {
    generateStyleEntry,
    CMS_CACHE_KEYS,
    PUBLISHED_PAGE_SNAPSHOT_ROUTE,
    servePublishedPageSnapshot,
} from "@bernouy/cms-content/rendering";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { CMS_CAPABILITY_CALL_ROUTE } from "@bernouy/cms-gateway/http/handlers";
import { handlePageRequest } from "cms-delivery/core/pages/handlePageRequest";
import { FAVICON_ROUTE } from "cms-delivery/core/assets/defaultFavicon";
import { matchRootSitemapChunkPath } from "cms-delivery/core/seo/sitemap/manifest";
import { createDeliveryMaintenanceGuard } from "cms-delivery/core/maintenance";
import CollectionAssetServer from "cms-delivery/endpoints/assets/collectionAsset.server";
import { COLLECTION_ASSETS_ROUTE } from "cms-delivery/core/assets/collectionAssets";

/**
 * Wire every Delivery endpoint onto `delivery.runner`. Called from the
 * `DeliveryCms` constructor — `new DeliveryCms(...)` is enough; consumers
 * don't call this directly. Routes are registered relative to the runner's
 * `basePath`, so whatever tenant prefix is scoped via `rootRunner.group(...)`
 * gets prepended automatically. Assets always sit under a `/.cms` sub-prefix
 * within the tenant; pages sit at the tenant root and fall through to the
 * default endpoint.
 *
 * Pages are served through the runner's default GET endpoint: any path that
 * doesn't match a specific route falls through to `handlePageRequest`, which
 * does a single DB lookup and either renders or 404s. No boot-time hydration,
 * no registry to keep in sync with page CRUD.
 */
export function registerDeliveryEndpoints(delivery: DeliveryCms) {
    const runner = delivery.runner;
    runner.use(createDeliveryMaintenanceGuard(delivery));

    runner.addEndpoint("GET", "/.cms/bloc", (req) => BlocServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/blocset", (req) => BlocSetServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/component.js", (req) => ComponentServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/cms-binding-core.js", (req) => BindingCoreServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/favicon", (req) => FaviconServer(req, delivery));
    runner.group(COLLECTION_ASSETS_ROUTE, (assetsRunner) => {
        assetsRunner.setDefaultEndpoint("GET", (req) => CollectionAssetServer(req, delivery));
        assetsRunner.setDefaultEndpoint("HEAD", (req) => CollectionAssetServer(req, delivery));
    });
    runner.addEndpoint("GET", PUBLISHED_PAGE_SNAPSHOT_ROUTE, (req) =>
        servePublishedPageSnapshot(delivery.repository, req),
    );

    if (delivery.auth) {
        runner.group(PUBLIC_AUTH_ROUTES.base, (authRunner) => {
            registerPublicAuthRoutes(authRunner, delivery.auth!);
        });
    }

    runner.addEndpoint("GET", "/robots.txt", (req) => RobotsServer(req, delivery));
    runner.addEndpoint("GET", "/sitemap.xml", (req) => SitemapServer(req, delivery));
    runner.addEndpoint("GET", FAVICON_ROUTE, (req) => FaviconServer(req, delivery));
    runner.addEndpoint("HEAD", FAVICON_ROUTE, (req) => FaviconServer(req, delivery));

    // Shared `.cms/*` handlers — Control mounts the same three, admin-guarded.
    // `generateStyleEntry` is the same producer `resolveAssets` uses for the
    // `?v=<hash>` link, so served bytes match. Source secrets stay unwired
    // unless the composition root explicitly provides a resolver; otherwise a
    // `secret`-sourced header yields a clean 500 and unconfigured sources
    // yields 501.
    runner.addEndpoint("GET", "/.cms/style", (req) =>
        cachedResponseAsync(
            req,
            CMS_CACHE_KEYS.STYLE,
            delivery.cache,
            async () => generateStyleEntry(delivery.repository),
            publicAssetCacheControl(req),
        ),
    );

    if (delivery.capabilityGateway) {
        runner.group(CMS_CAPABILITY_CALL_ROUTE, (callRunner) => {
            for (const method of ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"] as const) {
                callRunner.setDefaultEndpoint(method, (request) => handleCapabilityCall(request, delivery));
            }
        });
    }

    runner.setDefaultEndpoint("GET", (req) =>
        isRootSitemapChunkRequest(req, delivery) ? SitemapChunkServer(req, delivery) : handlePageRequest(req, delivery),
    );
    runner.setDefaultEndpoint("HEAD", async (req) =>
        withoutBody(
            await (isRootSitemapChunkRequest(req, delivery)
                ? SitemapChunkServer(req, delivery)
                : handlePageRequest(req, delivery)),
        ),
    );
}

function isRootSitemapChunkRequest(request: Request, delivery: DeliveryCms): boolean {
    const pathname = new URL(request.url).pathname.slice(delivery.basePath.length);
    return !!matchRootSitemapChunkPath(pathname);
}

function withoutBody(response: Response): Response {
    return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}
