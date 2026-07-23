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
    SourceRepository,
    SourceRequestTelemetryOptions,
    SourceSecretResolver,
} from "@bernouy/cms-sources";
import type { TriggerRepository } from "@bernouy/cms-triggers";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { HeadInjector } from "./HeadInjector";

export type DeliveryCmsConfig = {
    runner?: Runner;
    repository: ContentReader;
    cache?: Cache;
    /**
     * Extensions called in registration order for each rendered document,
     * immediately after the basic HTML head is built.
     */
    headInjectors?: readonly HeadInjector[];
    /** Data sources exposed by the optional same-origin source gateway. */
    sources?: SourceRepository;
    /** Trusted functions projected as the system-functions source. */
    functions?: FunctionRepository;
    /** Endpoint triggers. Sources and functions must also be configured. */
    triggers?: TriggerRepository;
    /** Federated opaque identity aliases used by functions and bindings. */
    identities?: IdentityService;
    /**
     * Resolver for source header secrets. Only composition roots that enforce
     * the appropriate source access policy should provide one.
     */
    sourceResolveSecret?: SourceSecretResolver;
    /** Request timings and non-blocking endpoint metrics supplied by the runtime. */
    sourceTelemetry?: SourceRequestTelemetryOptions;
    /** Runtime-owned allowlist for forwarding the opaque correlation header. */
    sourceTrustedConnectorTarget?: NonNullable<ExecutorDeps["isTrustedConnectorTarget"]>;
    /** Optional first-party public authentication routes and system source. */
    auth?: PublicAuthRoutesConfig<string>;
    /** Role definitions used to authorize public source endpoint calls. */
    roles?: RolesRepository;
    /** Successful integration snapshots used to extend the page CSP. */
    integrationInstallations?: IntegrationInstallationRepository;
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
    filesMetadata?: CmsFilesMetadataRepository;
    filesBlob?: CmsFilesBlobStore;
    /** Shared storage for derived responsive image variants. */
    variantStore?: CmsFilesBlobStore;
};
