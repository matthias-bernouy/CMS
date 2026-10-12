import type { BlobStore } from "@bernouy/blob-store";
import type {
    Authentication,
    IdentityProviderRepository,
    LocalAuthenticationActions,
    Subject,
} from "@bernouy/cms-auth";
import type { OidcAuthHandlers, PublicAuthRoutesConfig } from "@bernouy/cms-auth/http";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import type { CollectionMigrationService } from "@bernouy/cms-repository/collections/installations";
import type { InstalledCollectionAssetSource } from "@bernouy/cms-repository/collections/assets";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import type { PageExecutionService } from "@bernouy/cms-gateway/execution";
import type { Cache, Runner } from "@bernouy/http-runner";

export type KernelCmsConfig = {
    runner: Runner;
    content: ContentReader;
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
    collectionAssets?: InstalledCollectionAssetSource;
    cache: Cache;
    enforcePageCsp?: boolean;
    capabilityGateway?: {
        readonly siteId: string;
        readonly invoker: GatewayInvoker;
        readonly isAdministrator: (subject: Subject) => Promise<boolean>;
        readonly authenticateProvider?: (token: string) => Promise<string | null>;
    };
    pageExecution?: PageExecutionService;
    sitemapStore?: BlobStore;
};
