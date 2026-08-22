import type DeliveryCms from "cms-delivery/DeliveryCms";
import BlocServer from "cms-delivery/endpoints/bloc.server";
import BlocSetServer from "cms-delivery/endpoints/blocset.server";
import RobotsServer from "cms-delivery/endpoints/robots.txt.server";
import SitemapServer from "cms-delivery/endpoints/sitemap.xml.server";
import SitemapChunkServer from "cms-delivery/endpoints/sitemap-chunk.server";
import FaviconServer from "cms-delivery/endpoints/assets/favicon.server";
import ComponentServer from "cms-delivery/endpoints/assets/component.server";
import BindingCoreServer from "cms-delivery/endpoints/assets/bindingCore.server";
import { PUBLIC_AUTH_ROUTES, registerPublicAuthRoutes } from "@bernouy/cms-auth";
import {
    CMS_FILES_ROUTE,
    CMS_IMAGE_VARIANT_ROUTE,
    filesPrefix,
    imageVariantPrefix,
    serveFilesRequest,
    serveVariantRequest,
} from "@bernouy/cms-files";
import { SYSTEM_AUTH_SOURCE_ID, sourcesPrefix } from "@bernouy/cms-sources";
import {
    generateStyleEntry,
    P9R_CACHE,
    PUBLISHED_PAGE_SNAPSHOT_ROUTE,
    servePublishedPageSnapshot,
} from "@bernouy/cms-content";
import {
    CMS_CORRELATION_HEADER,
    cachedResponseAsync,
    getRequestIP,
    publicAssetCacheControl,
    requestCorrelationId,
    setRequestIP,
} from "@bernouy/http-runner";
import { recordPageView } from "cms-delivery/core/analytics/recordPageView";
import {
    handleDeliverySourceRequest,
    registerDeliverySourceProxy,
} from "cms-delivery/core/sources/registerSourceProxy";
import { deliverySourceOverlaySchemaCache } from "cms-delivery/core/sources/requestScope";
import { handlePageRequest } from "cms-delivery/core/pages/handlePageRequest";
import {
    PRIVACY_ANALYTICS_ROUTES,
    analyticsPreferencePost,
    analyticsPrivacyPage,
    analyticsSelfAssessment,
} from "cms-delivery/core/analytics/privacyAnalyticsEndpoints";
import { getDeliveryIntegrationThemeContributions } from "cms-delivery/core/assets/resolveAssets";
import { FAVICON_ROUTE } from "cms-delivery/core/assets/defaultFavicon";
import { SITEMAP_CHUNKS_ROUTE } from "cms-delivery/core/seo/sitemap/manifest";

/**
 * Wire every Delivery endpoint onto `delivery.runner`. Called from the
 * `DeliveryCms` constructor — `new DeliveryCms(...)` is enough; consumers
 * don't call this directly. Routes are registered relative to the runner's
 * `basePath`, so whatever tenant prefix is scoped via `rootRunner.group(...)`
 * gets prepended automatically. Assets always sit under a `/.cms` sub-prefix
 * within the tenant; pages sit at the tenant root and fall through to the
 * default endpoint.
 *
 * File bytes are served at `<basePath>/.cms/files/<readable-path>`, resolving
 * the path against the file metadata tree and streaming from the blob store
 * (the same backends Control writes to).
 *
 * Pages are served through the runner's default GET endpoint: any path that
 * doesn't match a specific route falls through to `handlePageRequest`, which
 * does a single DB lookup and either renders or 404s. No boot-time hydration,
 * no registry to keep in sync with page CRUD.
 */
export function registerDeliveryEndpoints(delivery: DeliveryCms) {
    const runner = delivery.runner;

    runner.addEndpoint("GET", PRIVACY_ANALYTICS_ROUTES.page, (req) => analyticsPrivacyPage(req, delivery));
    runner.addEndpoint("POST", PRIVACY_ANALYTICS_ROUTES.optOut, (req) => analyticsPreferencePost(req, delivery, true));
    runner.addEndpoint("POST", PRIVACY_ANALYTICS_ROUTES.enable, (req) => analyticsPreferencePost(req, delivery, false));
    runner.addEndpoint("GET", PRIVACY_ANALYTICS_ROUTES.selfAssessment, (req) => analyticsSelfAssessment(req, delivery));

    runner.addEndpoint("GET", "/.cms/bloc", (req) => BlocServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/blocset", (req) => BlocSetServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/component.js", (req) => ComponentServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/cms-binding-core.js", (req) => BindingCoreServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/favicon", (req) => FaviconServer(req, delivery));
    runner.addEndpoint("GET", PUBLISHED_PAGE_SNAPSHOT_ROUTE, (req) =>
        servePublishedPageSnapshot(delivery.repository, req),
    );

    if (delivery.auth) {
        const schemaCache = deliverySourceOverlaySchemaCache(delivery);
        runner.group(PUBLIC_AUTH_ROUTES.base, (authRunner) => {
            registerPublicAuthRoutes(
                authRunner,
                delivery.auth!,
                delivery.sources
                    ? {
                          signup: (request) =>
                              handleDeliverySourceRequest(
                                  delivery,
                                  canonicalSignupSourceRequest(request, runner.basePath),
                                  { schemaCache },
                              ),
                      }
                    : {},
            );
        });
    }

    runner.addEndpoint("GET", "/robots.txt", (req) => RobotsServer(req, delivery));
    runner.addEndpoint("GET", "/sitemap.xml", (req) => SitemapServer(req, delivery));
    runner.group(SITEMAP_CHUNKS_ROUTE, (sitemapRunner) => {
        sitemapRunner.setDefaultEndpoint("GET", (req) => SitemapChunkServer(req, delivery));
    });
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
            P9R_CACHE.STYLE,
            delivery.cache,
            async () =>
                generateStyleEntry(
                    delivery.repository,
                    await getDeliveryIntegrationThemeContributions(delivery.integrationInstallations),
                ),
            publicAssetCacheControl(req),
        ),
    );

    runner.group(CMS_FILES_ROUTE, (filesRunner) => {
        const prefix = filesPrefix(runner.basePath);
        filesRunner.setDefaultEndpoint("GET", (req) =>
            serveFilesRequest({ metadata: delivery.filesMetadata, blob: delivery.filesBlob }, req, { prefix }),
        );
    });

    registerDeliverySourceProxy(delivery);

    // Responsive image variants at `/.cms/img/<id>/<width>.webp` — mounted only
    // when a variant store is wired (else the renderer just serves originals).
    if (delivery.variantStoreOrNull && delivery.filesMetadataOrNull && delivery.filesBlobOrNull) {
        runner.group(CMS_IMAGE_VARIANT_ROUTE, (imgRunner) => {
            const prefix = imageVariantPrefix(runner.basePath);
            imgRunner.setDefaultEndpoint("GET", (req) =>
                serveVariantRequest(
                    {
                        metadata: delivery.filesMetadata,
                        sourceBlob: delivery.filesBlob,
                        variantStore: delivery.variantStoreOrNull!,
                    },
                    req,
                    { prefix },
                ),
            );
        });
    }

    runner.setDefaultEndpoint("GET", (req) => recordPageView(req, delivery));
    runner.setDefaultEndpoint("HEAD", async (req) => withoutBody(await handlePageRequest(req, delivery)));
}

function withoutBody(response: Response): Response {
    return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}

function canonicalSignupSourceRequest(request: Request, basePath: string): Request {
    const url = new URL(request.url);
    url.pathname = `${sourcesPrefix(basePath)}${SYSTEM_AUTH_SOURCE_ID}/signup`;
    url.search = "";
    const canonical = new Request(url, request);
    canonical.headers.set(CMS_CORRELATION_HEADER, requestCorrelationId(request));
    const requestIP = getRequestIP(request);
    if (requestIP) {
        setRequestIP(canonical, requestIP);
    }
    return canonical;
}
