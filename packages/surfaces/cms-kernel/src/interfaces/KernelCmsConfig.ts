import type { BlobStore } from "@bernouy/blob-store";
import type {
    Authentication,
    IdentityProviderRepository,
    LocalAuthenticationActions,
    Subject,
} from "@bernouy/cms-auth";
import type { OidcAuthHandlers, PublicAuthRoutesConfig } from "@bernouy/cms-auth/http";
import type { CmsRepository } from "@bernouy/cms-content/kernel";
import type { CollectionMigrationService, CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { GatewayCapabilityCatalogue, GatewayInvoker } from "@bernouy/cms-gateway";
import type { PageExecutionAuthority } from "@bernouy/cms-gateway/execution";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { PublicPageProvider } from "./PublicPageProvider";

export type KernelCmsConfig = {
    runner?: Runner;
    repository: CmsRepository;
    authentication: Authentication;
    publicAuth?: PublicAuthRoutesConfig;
    authBackends?: {
        local?: LocalAuthenticationActions;
        oidc?: OidcAuthHandlers;
    };
    identityProviders?: IdentityProviderRepository;
    collections?: {
        siteId: string;
        migrations: CollectionMigrationService;
    };
    collectionAssets?: {
        siteId: string;
        store: Pick<
            CollectionStore,
            "getInstalledAssetMetadata" | "getInstalledAssetMetadataBatch" | "getReleaseAsset"
        >;
    };
    cache?: Cache;
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
