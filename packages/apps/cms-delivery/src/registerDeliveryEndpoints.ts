import type DeliveryCms from "cms-delivery/DeliveryCms";
import BlocServer      from "cms-delivery/endpoints/bloc.server";
import RobotsServer    from "cms-delivery/endpoints/robots.txt.server";
import SitemapServer   from "cms-delivery/endpoints/sitemap.xml.server";
import FaviconServer   from "cms-delivery/endpoints/assets/favicon.server";
import ComponentServer from "cms-delivery/endpoints/assets/component.server";
import { registerGatewayEndpoint } from "@bernouy/cms-gateway";
import { registerFilesEndpoint, registerStyleEndpoint } from "@bernouy/cms-shared";
import { generateStyleEntry } from "cms-delivery/core/assets/buildStyle";
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
    runner.addEndpoint("GET", "/.cms/assets/component.js", (req) => ComponentServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/favicon",      (req) => FaviconServer  (req, delivery));

    runner.addEndpoint("GET", "/robots.txt",  (req) => RobotsServer (req, delivery));
    runner.addEndpoint("GET", "/sitemap.xml", (req) => SitemapServer(req, delivery));

    // Shared `.cms/*` registrars — Control mounts the same three, admin-guarded.
    // `generateStyleEntry` is the same producer `resolveAssets` uses for the
    // `?v=<hash>` link, so served bytes match. Gateway is public + unwired here
    // (no `deps.resolveSecret`) → a `secret`-sourced header yields a clean 500;
    // an unconfigured gateway yields 501.
    registerStyleEndpoint({ runner, cache: delivery.cache, generate: () => generateStyleEntry(delivery.repository) });
    registerFilesEndpoint({ runner, metadata: delivery.filesMetadata, blob: delivery.filesBlob });
    registerGatewayEndpoint({ runner, gateway: delivery.gateway });

    runner.setDefaultEndpoint("GET", (req) => recordPageView(req, delivery));

}
