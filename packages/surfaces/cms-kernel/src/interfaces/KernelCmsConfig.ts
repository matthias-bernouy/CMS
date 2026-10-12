import type { BlobStore } from "@bernouy/blob-store";
import type {
    Authentication,
    IdentityProviderRepository,
    LocalAuthenticationActions,
    Subject,
} from "@bernouy/cms-auth";
import type { OidcAuthHandlers, PublicAuthRoutesConfig } from "@bernouy/cms-auth/http";
import type { CmsRepository, PageRouteRegistry } from "@bernouy/cms-content/kernel";
import type { CollectionTextSource } from "@bernouy/cms-repository/collections/content";
import type { CollectionMigrationService, CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { GatewayCapabilityCatalogue, GatewayInvoker } from "@bernouy/cms-gateway";
import type { PageExecutionAuthority } from "@bernouy/cms-gateway/execution";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { HeadInjector } from "./HeadInjector";
import type { PublicPageProvider } from "./PublicPageProvider";

export type KernelCmsConfig = {
    runner?: Runner;
    publicUrl: string;
    repository: CmsRepository;
    authentication: Authentication;
    publicAuth?: PublicAuthRoutesConfig & {
        emailTest?: { send(input: { kind: "email_verification" | "password_reset"; to: string }): Promise<void> };
    };
    authBackends?: {
        local?: LocalAuthenticationActions;
        oidc?: OidcAuthHandlers;
    };
    identityProviders?: IdentityProviderRepository;
    administrator?: (subject: Subject) => Promise<boolean>;
    collections?: {
        store: CollectionStore;
        siteId: string;
        routes: PageRouteRegistry;
        migrations: CollectionMigrationService;
    };
    collectionTexts?: readonly CollectionTextSource[];
    collectionAssets?: {
        siteId: string;
        store: Pick<
            CollectionStore,
            "getInstalledAssetMetadata" | "getInstalledAssetMetadataBatch" | "getReleaseAsset"
        >;
    };
    cache?: Cache;
    headInjectors?: readonly HeadInjector[];
    publicPageProviders?: readonly PublicPageProvider[];
    capabilityGateway?: {
        readonly siteId: string;
        readonly invoker: GatewayInvoker;
        readonly resolveCapabilityAccess?: (
            contractId: string,
            capabilityId: string,
        ) => Promise<"public" | "authenticated" | "admin" | null>;
        readonly catalogue?: GatewayCapabilityCatalogue;
        readonly pageExecutions?: PageExecutionAuthority;
        readonly isAdministrator: (subject: Subject) => Promise<boolean>;
        readonly authenticateProvider?: (token: string) => Promise<string | null>;
    };
    sitemapStore?: BlobStore;
};
