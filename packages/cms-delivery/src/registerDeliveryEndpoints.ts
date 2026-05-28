import type DeliveryCms from "cms-delivery/DeliveryCms";
import BlocServer      from "cms-delivery/endpoints/bloc.server";
import StyleServer     from "cms-delivery/endpoints/style.server";
import RobotsServer    from "cms-delivery/endpoints/robots.txt.server";
import SitemapServer   from "cms-delivery/endpoints/sitemap.xml.server";
import FaviconServer   from "cms-delivery/endpoints/assets/favicon.server";
import ComponentServer from "cms-delivery/endpoints/assets/component.server";
import { handlePageRequest } from "cms-delivery/core/pages/handlePageRequest";

/**
 * Wire every Delivery endpoint onto `delivery.runner`. Called from the
 * `DeliveryCms` constructor — `new DeliveryCms(...)` is enough; consumers
 * don't call this directly. Routes are registered relative to the runner's
 * `basePath`, so whatever tenant prefix is scoped via `rootRunner.group(...)`
 * gets prepended automatically. Assets always sit under a `/.cms` sub-prefix
 * within the tenant; pages sit at the tenant root and fall through to the
 * default endpoint.
 *
 * Media is deliberately absent — Delivery only derives URLs through
 * `MediaUrlBuilder.formatImageUrl` and lets the storage backend serve the
 * bytes directly.
 *
 * Pages are served through the runner's default GET endpoint: any path that
 * doesn't match a specific route falls through to `handlePageRequest`, which
 * does a single DB lookup and either renders or 404s. No boot-time hydration,
 * no registry to keep in sync with page CRUD.
 */
export function registerDeliveryEndpoints(delivery: DeliveryCms){

    const runner = delivery.runner;

    runner.addEndpoint("GET", "/.cms/bloc",                (req) => BlocServer     (req, delivery));
    runner.addEndpoint("GET", "/.cms/style",               (req) => StyleServer    (req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/component.js", (req) => ComponentServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/favicon",      (req) => FaviconServer  (req, delivery));

    runner.addEndpoint("GET", "/robots.txt",  (req) => RobotsServer (req, delivery));
    runner.addEndpoint("GET", "/sitemap.xml", (req) => SitemapServer(req, delivery));

    // Data-provider proxy entrypoint — stub. The real handler will mint a
    // CMS-signed JWT and forward to the registered provider; until then any
    // request under `/.cms/data/...` returns 501 so consumers get a clear
    // signal rather than a misleading 404.
    runner.group("/.cms/data", (proxyRunner) => {
        const notImplemented = () => new Response("data-provider proxy not implemented yet", { status: 501 });
        for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
            proxyRunner.setDefaultEndpoint(method, notImplemented);
        }
    });

    runner.setDefaultEndpoint("GET", (req) => handlePageRequest(req, delivery));

}
