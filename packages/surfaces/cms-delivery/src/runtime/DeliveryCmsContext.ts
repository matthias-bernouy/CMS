import type { AnalyticsStore } from "@bernouy/cms-analytics";
import type { PublicAuthRoutesConfig } from "@bernouy/cms-auth";
import type { ContentReader } from "@bernouy/cms-content";
import type { CmsFilesBlobStore, CmsFilesMetadataRepository } from "@bernouy/cms-files";
import type { FunctionRepository } from "@bernouy/cms-functions";
import type { IdentityService } from "@bernouy/cms-identities";
import type { IntegrationInstallationRepository } from "@bernouy/cms-integrations";
import type { RolesRepository } from "@bernouy/cms-permissions";
import type {
    ExecutorDeps,
    SourceOverlayRepository,
    SourceRepository,
    SourceRequestTelemetryOptions,
    SourceSecretResolver,
} from "@bernouy/cms-sources";
import type { TriggerRepository } from "@bernouy/cms-triggers";
import { BunRunner, type Cache, type Runner, TtlCache } from "@bernouy/http-runner";
import { PageOptimizer } from "cms-delivery/core/pages/PageOptimizer";
import type { DeliveryCmsConfig } from "cms-delivery/interfaces/DeliveryCmsConfig";
import type { HeadInjector } from "cms-delivery/interfaces/HeadInjector";

export class DeliveryCmsContext {
    private readonly config: DeliveryCmsConfig;
    private readonly resolvedRunner: Runner;
    private readonly resolvedCache: Cache;
    private readonly pageOptimizer: PageOptimizer | null;

    constructor(config: DeliveryCmsConfig) {
        this.config = config;
        this.resolvedRunner = config.runner ?? new BunRunner();
        this.resolvedCache = config.cache ?? new TtlCache({ bypass: process.env.MODE === "DEV" });
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

    get sources(): SourceRepository | undefined {
        return this.config.sources;
    }

    get sourceOverlays(): SourceOverlayRepository | undefined {
        return this.config.sourceOverlays;
    }

    get sourceResolveSecret(): SourceSecretResolver | undefined {
        return this.config.sourceResolveSecret;
    }

    get sourceTelemetry(): SourceRequestTelemetryOptions | undefined {
        return this.config.sourceTelemetry;
    }

    get sourceTrustedConnectorTarget(): NonNullable<ExecutorDeps["isTrustedConnectorTarget"]> | undefined {
        return this.config.sourceTrustedConnectorTarget;
    }

    get functions(): FunctionRepository | undefined {
        return this.config.functions;
    }

    get triggers(): TriggerRepository | undefined {
        return this.config.triggers;
    }

    get identities(): IdentityService | undefined {
        return this.config.identities;
    }

    get auth(): PublicAuthRoutesConfig<string> | undefined {
        return this.config.auth;
    }

    get roles(): RolesRepository | undefined {
        return this.config.roles;
    }

    get integrationInstallations(): IntegrationInstallationRepository | undefined {
        return this.config.integrationInstallations;
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

    get filesMetadata(): CmsFilesMetadataRepository {
        if (!this.config.filesMetadata) {
            throw new Error("files metadata backend not configured");
        }
        return this.config.filesMetadata;
    }

    get filesMetadataOrNull(): CmsFilesMetadataRepository | null {
        return this.config.filesMetadata ?? null;
    }

    get variantStoreOrNull(): CmsFilesBlobStore | null {
        return this.config.variantStore ?? null;
    }

    optimizePage(path: string, imageIds: string[]): void {
        this.pageOptimizer?.optimize(path, imageIds);
    }

    get filesBlob(): CmsFilesBlobStore {
        if (!this.config.filesBlob) {
            throw new Error("files blob backend not configured");
        }
        return this.config.filesBlob;
    }

    get filesBlobOrNull(): CmsFilesBlobStore | null {
        return this.config.filesBlob ?? null;
    }

    get basePath(): string {
        return this.resolvedRunner.basePath === "/" ? "" : this.resolvedRunner.basePath;
    }

    get cmsPathPrefix(): string {
        return this.basePath + "/.cms";
    }
}
