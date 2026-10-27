import type { CapabilityHttpHandlerConfig } from "@bernouy/cms-gateway/http/handlers";
import type { ContentReader, RenderablePage } from "@bernouy/cms-content/rendering";
import type { SiteUpgradeStorage } from "@bernouy/cms-repository/upgrades";
import type { InstalledCollectionAssetSource } from "@bernouy/cms-repository/collections/assets";
import type { GatewayActor } from "@bernouy/cms-gateway";
import type { PageCapabilityAccessPort } from "@bernouy/cms-gateway/analysis";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";

export type KernelCmsConfig = {
    runner: Runner;
    mcpHandler?: (request: Request) => Promise<Response | null>;
    content: ContentReader;
    editorialPages?: {
        resolveRoute(path: string): Promise<{ readonly page: RenderablePage; readonly language: string } | null>;
    };
    resolveActor(request: Request): Promise<GatewayActor>;
    sessionCookie?: { readonly secure?: boolean };
    collections?: {
        siteId: string;
        upgrades: Pick<SiteUpgradeStorage, "getActive">;
    };
    collectionAssets?: InstalledCollectionAssetSource;
    cache: Cache;
    enforcePageCsp?: boolean;
    capabilityGateway?: {
        readonly siteId: string;
        readonly invoker: CapabilityHttpHandlerConfig["invoker"];
        readonly authenticateProvider?: (token: string) => Promise<string | null>;
        readonly resolveCapability?: (
            contractId: string,
            capabilityId: string,
        ) => Promise<{
            readonly access: "public" | "authenticated" | "admin";
            readonly effect: "query" | "command";
            readonly outputType: string;
        } | null>;
        readonly onMutationSuccess?: (target: { readonly contractId: string; readonly capabilityId: string }) => void;
    };
    pageCapabilities?: PageCapabilityAccessPort;
    capabilityHandler?: (request: Request) => Promise<Response>;
    mutationHandler?: (request: Request) => Promise<Response>;
    queryHandler?: (request: Request) => Promise<Response>;
    collectionAssetHandler?: (request: Request) => Promise<Response>;
    sitemapHandler: (request: Request) => Promise<Response>;
    sitemapChunkHandler: (request: Request) => Promise<Response>;
    robotsHandler: (request: Request) => Promise<Response>;
    logger: Logger;
};
