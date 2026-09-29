import type { AnalyticsStore } from "@bernouy/cms-analytics";
import type { PublicAuthRoutesConfig } from "@bernouy/cms-auth/http";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import type {
    BlobReader,
    VariantStore,
    SitemapStore,
    PublicFileMetadataLookup,
} from "@bernouy/cms-content/files/serving";
import type { IdentityService } from "@bernouy/cms-gateway/identity";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import type {
    SourceEndpointInterceptor,
    SourceRepository,
    SourceRequestTelemetryOptions,
    SourceSecretResolver,
} from "@bernouy/cms-sources";
import { CompositeSourceRepository, SYSTEM_SOURCES } from "@bernouy/cms-sources";
import type { ResponsiveSourceImageRollout } from "@bernouy/cms-source-images/browser-host";
import { BunRunner, type Cache, type Runner, TtlCache } from "@bernouy/http-runner";
import { PageOptimizer } from "cms-delivery/core/pages/PageOptimizer";
import type { DeliveryCmsConfig } from "cms-delivery/interfaces/DeliveryCmsConfig";
import type { HeadInjector } from "cms-delivery/interfaces/HeadInjector";
import type { PublicPageProvider } from "cms-delivery/interfaces/PublicPageProvider";

export class DeliveryCmsContext {
    private readonly config: DeliveryCmsConfig;
    private readonly resolvedRunner: Runner;
    private readonly resolvedCache: Cache;
    private readonly resolvedSources: SourceRepository | undefined;
    private readonly pageOptimizer: PageOptimizer | null;

    constructor(config: DeliveryCmsConfig) {
        this.config = config;
        this.resolvedRunner = config.runner ?? new BunRunner();
        this.resolvedCache = config.cache ?? new TtlCache({ bypass: process.env.MODE === "DEV" });
        this.resolvedSources = config.sources
            ? new CompositeSourceRepository(config.sources, SYSTEM_SOURCES)
            : undefined;
        this.pageOptimizer =
            config.filesMetadata && config.filesBlob && config.variantStore
                ? new PageOptimizer({
                      cache: this.resolvedCache,
                      metadata: config.filesMetadata,
                      sourceBlob: config.filesBlob,
                      variantStore: config.variantStore,
                  })
                : null;
    }

    get runner(): Runner {
        return this.resolvedRunner;
    }

    get repository(): ContentReader {
        return this.config.repository;
    }

    get cache(): Cache {
        return this.resolvedCache;
    }

    get headInjectors(): readonly HeadInjector[] {
        return this.config.headInjectors ?? [];
    }

    get publicPageProviders(): readonly PublicPageProvider[] {
        return this.config.publicPageProviders ?? [];
    }

    get sources(): SourceRepository | undefined {
        return this.resolvedSources;
    }

    get sourceResolveSecret(): SourceSecretResolver | undefined {
        return this.config.sourceResolveSecret;
    }

    get sourceTelemetry(): SourceRequestTelemetryOptions | undefined {
        return this.config.sourceTelemetry;
    }

    get sourceImageInterceptor(): SourceEndpointInterceptor | undefined {
        return this.config.sourceImageInterceptor;
    }

    get responsiveSourceImageRollout(): ResponsiveSourceImageRollout {
        const interceptorReady = Boolean(this.config.sourceImageInterceptor);
        return {
            public: interceptorReady && this.config.responsivePublicSourceImagesEnabled !== false,
            private: interceptorReady && this.config.responsivePrivateSourceImagesEnabled !== false,
        };
    }

    get identities(): IdentityService | undefined {
        return this.config.identities;
    }

    get capabilityGateway(): DeliveryCmsConfig["capabilityGateway"] {
        return this.config.capabilityGateway;
    }

    get auth(): PublicAuthRoutesConfig | undefined {
        return this.config.auth;
    }

    get analytics(): AnalyticsStore | undefined {
        return this.config.analytics;
    }

    get analyticsVisitorSecret(): string | undefined {
        return this.config.analyticsVisitorSecret;
    }

    get analyticsSiteScope(): string | undefined {
        return this.config.analyticsSiteScope;
    }

    get analyticsTrustProxy(): boolean {
        return this.config.analyticsTrustProxy ?? false;
    }

    get analyticsTrustedProxyVerified(): boolean {
        return this.config.analyticsTrustedProxyVerified ?? false;
    }

    get analyticsCmsVersion(): string {
        return this.config.analyticsCmsVersion ?? "development";
    }

    get analyticsHonorDnt(): boolean {
        return this.config.analyticsHonorDnt ?? true;
    }

    get analyticsPrivacyPolicyUrl(): string | undefined {
        return this.config.analyticsPrivacyPolicyUrl;
    }

    get filesMetadata(): PublicFileMetadataLookup {
        if (!this.config.filesMetadata) {
            throw new Error("files metadata backend not configured");
        }
        return this.config.filesMetadata;
    }

    get filesMetadataOrNull(): PublicFileMetadataLookup | null {
        return this.config.filesMetadata ?? null;
    }

    get variantStoreOrNull(): VariantStore | null {
        return this.config.variantStore ?? null;
    }

    get sitemapStore(): SitemapStore {
        if (!this.config.sitemapStore) {
            throw new Error("sitemap storage backend not configured");
        }
        return this.config.sitemapStore;
    }

    get sitemapStoreOrNull(): SitemapStore | null {
        return this.config.sitemapStore ?? null;
    }

    optimizePage(path: string, imageIds: string[]): void {
        this.pageOptimizer?.optimize(path, imageIds);
    }

    get filesBlob(): BlobReader {
        if (!this.config.filesBlob) {
            throw new Error("files blob backend not configured");
        }
        return this.config.filesBlob;
    }

    get filesBlobOrNull(): BlobReader | null {
        return this.config.filesBlob ?? null;
    }

    get basePath(): string {
        return this.resolvedRunner.basePath === "/" ? "" : this.resolvedRunner.basePath;
    }

    get cmsPathPrefix(): string {
        return this.basePath + "/.cms";
    }
}
