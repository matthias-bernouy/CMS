import type { CollectionTextSource } from "@bernouy/cms-content/rendering";
import type { AnalyticsStore } from "@bernouy/cms-analytics";
import type { PublicAuthRoutesConfig } from "@bernouy/cms-auth/http";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import type {
    BlobReader,
    VariantStore,
    SitemapStore,
    PublicFileMetadataLookup,
} from "@bernouy/cms-content/files/serving";
import type { GatewayAccessProbe, GatewayInvoker } from "@bernouy/cms-gateway";
import type { ProviderImageService } from "@bernouy/cms-gateway/media";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { HeadInjector } from "./HeadInjector";
import type { PublicPageProvider } from "./PublicPageProvider";

export type DeliveryCmsConfig = {
    runner?: Runner;
    repository: ContentReader;
    /** Public collection texts, fixed for this instance. Recreate/invalidate page cache when changing them. */
    collectionTexts?: readonly CollectionTextSource[];
    cache?: Cache;
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
    /** Optional strict aggregate analytics writer. */
    analytics?: AnalyticsStore;
    /** Stable shared HMAC secret. Required by the production runtime. */
    analyticsVisitorSecret?: string;
    /** Stable tenant id or normalized public origin and base path. */
    analyticsSiteScope?: string;
    /** Trust X-Forwarded-For only behind an overwriting proxy. Defaults to false. */
    analyticsTrustProxy?: boolean;
    /** Whether an enabled proxy boundary has been operationally verified. */
    analyticsTrustedProxyVerified?: boolean;
    /** Runtime version included in compliance configuration fingerprints. */
    analyticsCmsVersion?: string;
    /** Optional defence-in-depth support for the legacy DNT request header. */
    analyticsHonorDnt?: boolean;
    /** Public privacy-policy link shown next to the audience-measurement opt-out. */
    analyticsPrivacyPolicyUrl?: string;
    /** File metadata and bytes backing the public file route. */
    filesMetadata?: PublicFileMetadataLookup;
    filesBlob?: BlobReader;
    /** Shared storage for derived responsive image variants. */
    variantStore?: VariantStore;
    /** Dedicated immutable chunk and atomic-manifest storage for generated sitemaps. */
    sitemapStore?: SitemapStore;
};
