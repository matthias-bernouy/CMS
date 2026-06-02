import type DeliveryCms from "cms-delivery/DeliveryCms";
import BlocServer      from "cms-delivery/endpoints/bloc.server";
import StyleServer     from "cms-delivery/endpoints/style.server";
import RobotsServer    from "cms-delivery/endpoints/robots.txt.server";
import SitemapServer   from "cms-delivery/endpoints/sitemap.xml.server";
import FaviconServer   from "cms-delivery/endpoints/assets/favicon.server";
import ComponentServer from "cms-delivery/endpoints/assets/component.server";
import GatewayServer   from "cms-delivery/endpoints/gateway.server";
import { serveFilesRequest } from "@bernouy/cms-shared";
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
    runner.addEndpoint("GET", "/.cms/style",               (req) => StyleServer    (req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/component.js", (req) => ComponentServer(req, delivery));
    runner.addEndpoint("GET", "/.cms/assets/favicon",      (req) => FaviconServer  (req, delivery));

    runner.addEndpoint("GET", "/robots.txt",  (req) => RobotsServer (req, delivery));
    runner.addEndpoint("GET", "/sitemap.xml", (req) => SitemapServer(req, delivery));

    // File bytes: /.cms/files/<readable-path> → metadata.getItemByPath → blob.get
    // (see `serveFilesRequest`). Grouped so the wildcard tail is the file path.
    runner.group("/.cms/files", (filesRunner) => {
        filesRunner.setDefaultEndpoint("GET", (req) =>
            serveFilesRequest(
                { metadata: delivery.filesMetadata, blob: delivery.filesBlob },
                req,
                { prefix: `${delivery.cmsPathPrefix}/files/` },
            ));
    });

    // Data-gateway proxy: /.cms/gateway/<provider>/<endpoint> → resolve + forward
    // (see `gateway.server.ts`). Returns 501 when no gateway is configured on
    // this DeliveryCms instance.
    runner.group("/.cms/gateway", (proxyRunner) => {
        for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
            proxyRunner.setDefaultEndpoint(method, (req) => GatewayServer(req, delivery));
        }
    });

    runner.setDefaultEndpoint("GET", (req) => handlePageRequest(req, delivery));

}
