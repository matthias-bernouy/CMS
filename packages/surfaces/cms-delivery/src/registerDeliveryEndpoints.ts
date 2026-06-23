import type DeliveryCms from "cms-delivery/DeliveryCms";
import BlocServer      from "cms-delivery/endpoints/bloc.server";
import BlocSetServer   from "cms-delivery/endpoints/blocset.server";
import RobotsServer    from "cms-delivery/endpoints/robots.txt.server";
import SitemapServer   from "cms-delivery/endpoints/sitemap.xml.server";
import FaviconServer   from "cms-delivery/endpoints/assets/favicon.server";
import ComponentServer from "cms-delivery/endpoints/assets/component.server";
import BindingCoreServer from "cms-delivery/endpoints/assets/bindingCore.server";
import { CMS_GATEWAY_ROUTE, GATEWAY_PROXY_METHODS, gatewayPrefix, handleGatewayRequest } from "@bernouy/cms-gateway";
import { CMS_FILES_ROUTE, CMS_IMAGE_VARIANT_ROUTE, filesPrefix, imageVariantPrefix, serveFilesRequest, serveVariantRequest } from "@bernouy/cms-files";
import { generateStyleEntry, P9R_CACHE } from "@bernouy/cms-content";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { recordPageView } from "cms-delivery/core/analytics/recordPageView";

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
export function registerDeliveryEndpoints(delivery: DeliveryCms){

    const runner = delivery.runner;

    runner.addEndpoint("GET", "/.cms/bloc",                (req) => BlocServer     (req, delivery));
    runner.addEndpoint("GET", "/.cms/blocset",             (req) => BlocSetServer  (req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/component.js",        (req) => ComponentServer  (req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/cms-binding-core.js", (req) => BindingCoreServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/favicon",             (req) => FaviconServer    (req, delivery));

    runner.addEndpoint("GET", "/robots.txt",  (req) => RobotsServer (req, delivery));
    runner.addEndpoint("GET", "/sitemap.xml", (req) => SitemapServer(req, delivery));

    // Shared `.cms/*` handlers — Control mounts the same three, admin-guarded.
    // `generateStyleEntry` is the same producer `resolveAssets` uses for the
    // `?v=<hash>` link, so served bytes match. Gateway secrets stay unwired
    // unless the composition root explicitly provides a resolver; otherwise a
    // `secret`-sourced header yields a clean 500 and an unconfigured gateway
    // yields 501.
    runner.addEndpoint("GET", "/.cms/style", (req) =>
        cachedResponseAsync(
            req,
            P9R_CACHE.STYLE,
            delivery.cache,
            () => generateStyleEntry(delivery.repository),
            publicAssetCacheControl(req),
        ));

    runner.group(CMS_FILES_ROUTE, (filesRunner) => {
        const prefix = filesPrefix(runner.basePath);
        filesRunner.setDefaultEndpoint("GET", (req) =>
            serveFilesRequest({ metadata: delivery.filesMetadata, blob: delivery.filesBlob }, req, { prefix }));
    });

    runner.group(CMS_GATEWAY_ROUTE, (proxyRunner) => {
        const prefix = gatewayPrefix(runner.basePath);
        const deps = delivery.gatewayResolveSecret
            ? { resolveSecret: delivery.gatewayResolveSecret }
            : undefined;
        for (const method of GATEWAY_PROXY_METHODS) {
            proxyRunner.setDefaultEndpoint(method, (req) =>
                handleGatewayRequest(delivery.gateway, req, { prefix, deps }));
        }
    });

    // Responsive image variants at `/.cms/img/<id>/<width>.webp` — mounted only
    // when a variant store is wired (else the renderer just serves originals).
    if (delivery.variantStoreOrNull && delivery.filesMetadataOrNull && delivery.filesBlobOrNull) {
        runner.group(CMS_IMAGE_VARIANT_ROUTE, (imgRunner) => {
            const prefix = imageVariantPrefix(runner.basePath);
            imgRunner.setDefaultEndpoint("GET", (req) => serveVariantRequest({
                metadata:     delivery.filesMetadata,
                sourceBlob:   delivery.filesBlob,
                variantStore: delivery.variantStoreOrNull!,
            }, req, { prefix }));
        });
    }

    runner.setDefaultEndpoint("GET", (req) => recordPageView(req, delivery));

}
