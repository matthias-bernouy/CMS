import type { CollectionTextSource } from "@bernouy/cms-repository/collections/content";
import type { BlobStore } from "@bernouy/blob-store";
import type { PublicAuthRoutesConfig } from "@bernouy/cms-auth/http";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import type { CollectionMigrationService } from "@bernouy/cms-repository/collections/installations";
import type { GatewayAccessProbe, GatewayInvoker } from "@bernouy/cms-gateway";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { HeadInjector } from "./HeadInjector";
import type { PublicPageProvider } from "./PublicPageProvider";

export type DeliveryCmsConfig = {
    runner?: Runner;
    repository: ContentReader;
    /** Public collection texts, fixed for this instance. Recreate/invalidate page cache when changing them. */
    collectionTexts?: readonly CollectionTextSource[];
    /** Installed immutable collection assets exposed under Delivery's tenant-scoped public asset route. */
    collectionAssets?: {
        siteId: string;
        store: Pick<
            CollectionStore,
            "getInstalledAssetMetadata" | "getInstalledAssetMetadataBatch" | "getReleaseAsset"
        >;
    };
    cache?: Cache;
    maintenance?: { siteId: string; migrations: Pick<CollectionMigrationService, "getActive"> };
    /**
     * Extensions called in registration order for each rendered document,
     * immediately after the basic HTML head is built.
     */
    headInjectors?: readonly HeadInjector[];
    /** Ordered fallback adapters consulted only when ContentReader has no published page for the request path. */
    publicPageProviders?: readonly PublicPageProvider[];
    /** Site-scoped capability invocation supplied by a trusted composition root. */
    capabilityGateway?: {
        readonly siteId: string;
        readonly invoker: GatewayInvoker;
        readonly access?: GatewayAccessProbe;
        readonly authenticateProvider?: (token: string) => Promise<string | null>;
    };
    /** Optional first-party public authentication routes. */
    auth?: PublicAuthRoutesConfig;
    /** Dedicated immutable chunk and atomic-manifest storage for generated sitemaps. */
    sitemapStore?: BlobStore;
};
