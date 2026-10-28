import { ContentDelivery, type ContentDeliveryHost } from "@bernouy/cms-content/public-delivery";
import type { Runner } from "@bernouy/http-runner";
import type { GatewayActor } from "@bernouy/cms-gateway";
import type { CapabilityHttpHandlerConfig } from "@bernouy/cms-gateway/http/handlers";
import { createCapabilityQueryHandler } from "@bernouy/cms-gateway/http/handlers";
import { collectionMaintenanceResponse, serveInstalledCollectionAsset } from "@bernouy/cms-repository/collections/http";
import type { SiteUpgradeStorage } from "@bernouy/cms-repository/upgrades";
import type { InstalledCollectionAssetSource } from "@bernouy/cms-repository/collections/assets";
import { resolveInstalledCollectionAssets } from "@bernouy/cms-repository/collections/assets";
import type { BlobStore } from "@bernouy/blob-store";
import { executeIndexingCapability } from "./indexing";
export type ContentHarnessOptions = Omit<
    ContentDeliveryHost,
    "basePath" | "cmsPathPrefix" | "resolveContributedAssets" | "resolveActor"
> & {
    runner: Runner;
    resolveActor(request: Request): Promise<GatewayActor>;
    collectionAssets?: InstalledCollectionAssetSource;
    collectionAssetHandler?: (request: Request) => Promise<Response>;
    capabilityGateway?: Pick<CapabilityHttpHandlerConfig, "siteId" | "invoker"> & {
        resolveCapability?: (
            contractId: string,
            capabilityId: string,
        ) => Promise<{ access: "public"; effect: "query"; outputType: string } | null>;
    };
    collections?: { siteId: string; upgrades: Pick<SiteUpgradeStorage, "getActive"> };
    sitemapStore?: BlobStore;
};
/** Test composition for the Content service. It does not mount a production public surface. */
export default class ContentHarness {
    readonly capabilityGateway;
    constructor(options: ContentHarnessOptions) {
        this.capabilityGateway = options.capabilityGateway;
        const basePath = options.runner.basePath === "/" ? "" : options.runner.basePath;
        const delivery = new ContentDelivery({
            ...options,
            publicUrl: "https://content.test",
            resolveContributedAssets: (input) => resolveInstalledCollectionAssets(input, options.collectionAssets, ""),
            serveCollectionAsset:
                options.collectionAssetHandler ??
                ((request) =>
                    options.collectionAssets
                        ? serveInstalledCollectionAsset(request, options.collectionAssets, "")
                        : Promise.resolve(new Response(null, { status: 404 }))),
            guard: options.collections
                ? (request) => collectionMaintenanceResponse(request, { ...options.collections!, basePath: "" })
                : undefined,
        });
        const handler = async (request: Request) => {
            const url = new URL(request.url);
            const actor = await options.resolveActor(request);
            if (actor.kind !== "anonymous" && actor.kind !== "user" && actor.kind !== "administrator") {
                throw new Error("Invalid Content actor fixture");
            }
            return delivery.resolvePath(
                {
                    path: url.pathname.slice(basePath.length) || "/",
                    method: request.method,
                    query: [...url.searchParams].map(([name, value]) => ({ name, value })),
                    ...(request.headers.has("if-none-match")
                        ? { ifNoneMatch: request.headers.get("if-none-match") }
                        : {}),
                },
                actor,
                (contractId, capabilityId, input) =>
                    executeIndexingCapability(options.capabilityGateway, actor, contractId, capabilityId, input),
            );
        };
        for (const method of ["GET", "HEAD"] as const) {
            options.runner.setDefaultEndpoint(method, handler);
            for (const path of [
                "/robots.txt",
                "/sitemap.xml",
                "/favicon.ico",
                "/_content/style",
                "/_content/blocset",
                "/_content/blocstyles",
                "/_content/published-page-snapshot",
            ]) {
                options.runner.addEndpoint(method, path, handler);
            }
        }
        if (options.capabilityGateway?.resolveCapability) {
            const capability = options.capabilityGateway;
            options.runner.group("/.cms/query", (runner) => {
                const query = createCapabilityQueryHandler({
                    ...capability,
                    resolveCapability: capability.resolveCapability!,
                    basePath,
                    resolveActor: options.resolveActor,
                });
                runner.setDefaultEndpoint("QUERY", query);
            });
        }
    }
}
