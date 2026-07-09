import type { Authentication, IdentityProviderRepository, LocalCredentialStore, PatRepository, PublicAuthRoutesConfig, UsersRepository } from "@bernouy/cms-auth";
import type { AnalyticsStore } from "@bernouy/cms-analytics";
import type { CmsRepository } from "@bernouy/cms-content";
import type { DashboardRepository } from "@bernouy/cms-dashboards";
import type { CmsFilesBlobStore, CmsFilesMetadataRepository } from "@bernouy/cms-files";
import type { FunctionRepository } from "@bernouy/cms-functions";
import { collectIntegrationInstallationCspExtras, type IntegrationConnectorDeployer, type IntegrationDefinitionRepository, type IntegrationInstallationRepository } from "@bernouy/cms-integrations";
import type { RelationRepository } from "@bernouy/cms-relations";
import type { Cache, CspExtras, Runner } from "@bernouy/http-runner";
import type { RolesRepository } from "@bernouy/cms-permissions";
import { createSecretResolver, type SecretStore } from "@bernouy/cms-secrets";
import { SourceOverlaySourceRepository, type ExecutorDeps, type SourceOverlayRepository, type SourceRepository } from "@bernouy/cms-sources";
import { withFunctionsSource } from "@bernouy/cms-functions";
import { join } from "node:path";
import type { CMS_ROLES } from "types/roles";
import { mergeUnique } from "cms-control/core/control/defaults";
import { mountControlCmsRoutes } from "cms-control/core/control/mountRoutes";
import { createControlCmsState } from "cms-control/core/control/state";
import type { ControlAuthBackends, ControlCmsOptions, ControlCmsState } from "cms-control/core/control/types";

export type { ControlAuthBackends, ControlCmsOptions } from "cms-control/core/control/types";

export class ControlCms {
    readonly ready: Promise<void>;
    private readonly state: ControlCmsState;

    constructor(
        runner: Runner,
        repository: CmsRepository,
        auth: Authentication<CMS_ROLES>,
        configuration: ControlCmsOptions = {},
        cache?: Cache,
        secrets?: SecretStore,
        filesMetadata?: CmsFilesMetadataRepository,
        filesBlob?: CmsFilesBlobStore,
        users?: UsersRepository<CMS_ROLES>,
        identityProviders?: IdentityProviderRepository,
        pats?: PatRepository,
        credentials?: LocalCredentialStore,
        sources?: SourceRepository,
        analytics?: AnalyticsStore,
        roles?: RolesRepository,
        authBackends: ControlAuthBackends = {},
    ) {
        this.state = createControlCmsState({
            configuration, runner, repository, auth, cache, secrets, filesMetadata, filesBlob,
            users, identityProviders, pats, credentials, sources, analytics, roles, authBackends,
        });
        this.ready = Promise.resolve();
        mountControlCmsRoutes(this, this.state, authBackends, join(__dirname, "./api"));
    }

    get config() { return this.state.configuration; }
    get repository() { return this.state.repository; }
    get auth() { return this.state.auth; }
    get runner() { return this.state.runner; }
    get cache() { return this.state.cache; }
    get secrets() { return this.state.secrets; }
    get roles(): RolesRepository { return this.state.roles; }
    get integrationCatalog(): IntegrationDefinitionRepository { return this.state.integrationCatalog; }
    get dashboards(): DashboardRepository { return this.state.dashboards; }
    get relations(): RelationRepository { return this.state.relations; }
    get functions(): FunctionRepository | null { return this.state.functions; }
    get triggers() { return this.state.triggers; }
    get sourceOverlays() { return this.state.sourceOverlays; }
    get configuredIntegrationInstallations(): IntegrationInstallationRepository | null { return this.state.integrationInstallations; }
    get integrationConnectorDeployers(): IntegrationConnectorDeployer[] | Record<string, IntegrationConnectorDeployer> | undefined { return this.state.configuration.integrationConnectorDeployers; }
    get integrationBlocRepository(): CmsRepository | null { return this.state.integrationBlocRepository; }
    get sourceExecutorDeps(): ExecutorDeps { return { resolveSecret: createSecretResolver(this.state.secrets) }; }

    get filesMetadata(): CmsFilesMetadataRepository {
        if (!this.state.filesMetadata) throw new Error("files metadata backend not configured");
        return this.state.filesMetadata;
    }

    get filesBlob(): CmsFilesBlobStore {
        if (!this.state.filesBlob) throw new Error("files blob backend not configured");
        return this.state.filesBlob;
    }

    get users(): UsersRepository<CMS_ROLES> {
        if (!this.state.users) throw new Error("users repository not configured");
        return this.state.users;
    }

    get identityProviders(): IdentityProviderRepository {
        if (!this.state.identityProviders) throw new Error("identity providers repository not configured");
        return this.state.identityProviders;
    }

    get pats(): PatRepository {
        if (!this.state.pats) throw new Error("PAT repository not configured");
        return this.state.pats;
    }

    get credentials(): LocalCredentialStore {
        if (!this.state.credentials) throw new Error("local credential store not configured");
        return this.state.credentials;
    }

    get publicAuth(): PublicAuthRoutesConfig<CMS_ROLES> {
        if (!this.state.configuration.publicAuth) throw new Error("public auth not configured");
        return this.state.configuration.publicAuth;
    }

    get integrationInstallations(): IntegrationInstallationRepository {
        if (!this.state.integrationInstallations) throw new Error("integration installations repository not configured");
        return this.state.integrationInstallations;
    }

    get sources(): SourceRepository {
        if (!this.state.sources) throw new Error("sources repository not configured");
        const overlaySources = this.state.sourceOverlays
            ? new SourceOverlaySourceRepository(this.state.sources, this.state.sourceOverlays, { deps: this.sourceExecutorDeps })
            : this.state.sources;
        return this.state.functions ? withFunctionsSource(overlaySources, this.state.functions) : overlaySources;
    }

    get analytics(): AnalyticsStore {
        if (!this.state.analytics) throw new Error("analytics store not configured");
        return this.state.analytics;
    }

    get basePath() {
        const base = this.state.runner.basePath;
        return base === "/" ? "" : base;
    }

    async getCspExtras(): Promise<CspExtras> {
        const settings = await this.state.repository.getSystem();
        const integrationCsp = this.state.integrationInstallations
            ? collectIntegrationInstallationCspExtras(await this.state.integrationInstallations.list())
            : null;
        return {
            connectExtras: mergeUnique(settings.security.connectExtras, integrationCsp?.connectExtras),
            mediaExtras: mergeUnique(settings.security.mediaExtras, integrationCsp?.mediaExtras),
            styleExtras: mergeUnique([], integrationCsp?.styleExtras),
            scriptExtras: mergeUnique([], integrationCsp?.scriptExtras),
            frameExtras: mergeUnique([], integrationCsp?.frameExtras),
        };
    }
}
