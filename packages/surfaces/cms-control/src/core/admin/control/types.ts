import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type {
    Authentication,
    IdentityProviderRepository,
    LocalAuthenticationActions,
    Subject,
} from "@bernouy/cms-auth";
import type { PublicAuthRoutesConfig, OidcAuthHandlers } from "@bernouy/cms-auth/http";
import type { CmsRepository, SurfacePageRouteRegistry } from "@bernouy/cms-content";
import type { CollectionMigrationService } from "@bernouy/cms-content/migrations";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import type { GatewayCapabilityCatalogue } from "@bernouy/cms-gateway";
import type { PageExecutionAuthority } from "@bernouy/cms-gateway/execution";
import type { Cache, Runner } from "@bernouy/http-runner";

type Configuration = {
    deliveryUrl?: string;
    publicAuth?: PublicAuthRoutesConfig & {
        emailTest?: { send(input: { kind: "email_verification" | "password_reset"; to: string }): Promise<void> };
    };
};

export type ControlCmsOptions = Configuration & {
    administrator?: (subject: Subject) => Promise<boolean>;
    collections?: {
        store: CollectionStore;
        siteId: string;
        routes?: SurfacePageRouteRegistry;
        migrations?: CollectionMigrationService;
    };
    capabilityGateway?: {
        readonly siteId: string;
        readonly invoker: GatewayInvoker;
        readonly catalogue?: GatewayCapabilityCatalogue;
        readonly pageExecutions?: PageExecutionAuthority;
        /** Host-owned verified administrator grant, independent of request fields. */
        readonly isAdministrator: (subject: Subject) => Promise<boolean>;
    };
};

export type ControlAuthBackends = {
    local?: LocalAuthenticationActions;
    oidc?: OidcAuthHandlers;
};

export type ControlCmsDependencies = {
    configuration?: ControlCmsOptions;
    cache?: Cache;
    identityProviders?: IdentityProviderRepository;
    authBackends?: ControlAuthBackends;
};

export type ControlCmsState = {
    configuration: ControlCmsOptions;
    runner: Runner;
    repository: CmsRepository;
    auth: Authentication;
    cache: Cache;
    identityProviders: IdentityProviderRepository | null;
};
