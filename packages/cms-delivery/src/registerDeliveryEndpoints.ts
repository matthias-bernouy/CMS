import type DeliveryCms from "src/delivery/DeliveryCms";
import BlocServer      from "src/delivery/endpoints/bloc.server";
import StyleServer     from "src/delivery/endpoints/style.server";
import RobotsServer    from "src/delivery/endpoints/robots.txt.server";
import SitemapServer   from "src/delivery/endpoints/sitemap.xml.server";
import FaviconServer   from "src/delivery/endpoints/assets/favicon.server";
import ComponentServer from "src/delivery/endpoints/assets/component.server";
import { handlePageRequest } from "src/delivery/core/pages/handlePageRequest";

/**
 * Wire every Delivery endpoint onto `delivery.runner`. Routes are registered
 * relative to the runner's `basePath` — whatever tenant prefix is scoped via
 * `rootRunner.group(...)` gets prepended automatically. Assets always sit
 * under a `/.cms` sub-prefix within the tenant; pages sit at the tenant root
 * and fall through to the default endpoint.
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

    runner.setDefaultEndpoint("GET", (req) => handlePageRequest(req, delivery));

}
