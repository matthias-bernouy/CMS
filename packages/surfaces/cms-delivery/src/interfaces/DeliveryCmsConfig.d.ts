import type { CollectionTextSource } from "@bernouy/cms-content/rendering";
import type { PublicAuthRoutesConfig } from "@bernouy/cms-auth/http";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import type { CollectionMigrationService } from "@bernouy/cms-content/migrations";
import type {
    BlobReader,
    VariantStore,
    SitemapStore,
    PublicFileMetadataLookup,
} from "@bernouy/cms-content/files/serving";
import type { GatewayAccessProbe, GatewayInvoker } from "@bernouy/cms-gateway";
import type { ProviderImageService } from "@bernouy/cms-gateway/media";
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
        store: Pick<CollectionStore, "snapshot" | "getInstalledAssetMetadata" | "getReleaseAsset">;
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
        readonly images?: Pick<ProviderImageService, "get">;
    };
    /** Optional first-party public authentication routes. */
    auth?: PublicAuthRoutesConfig;
    /** File metadata and bytes backing the public file route. */
    filesMetadata?: PublicFileMetadataLookup;
    filesBlob?: BlobReader;
    /** Shared storage for derived responsive image variants. */
    variantStore?: VariantStore;
    /** Dedicated immutable chunk and atomic-manifest storage for generated sitemaps. */
    sitemapStore?: SitemapStore;
};
