import type { Authentication, LocalAuthentication, OidcAuthentication, PublicAuthRoutesConfig } from "@bernouy/cms-auth";
import type { Runner } from "@bernouy/http-runner";
import { cachedResponseAsync, publicAssetCacheControl, redirect } from "@bernouy/http-runner";
import type { CmsRepository } from "@bernouy/cms-content";
import type { Cache } from "@bernouy/http-runner";
import { InMemoryCache } from "@bernouy/http-runner";
import type { SecretStore } from "@bernouy/cms-secrets";
import { InMemorySecretStore, ValidatingSecretStore, createSecretResolver } from "@bernouy/cms-secrets";
import { CMS_FILES_ROUTE, filesPrefix, serveFilesRequest } from "@bernouy/cms-files";
import { generateStyleEntry, P9R_CACHE } from "@bernouy/cms-content";
import type { CmsFilesMetadataRepository } from "@bernouy/cms-files";
import type { CmsFilesBlobStore } from "@bernouy/cms-files";
import type { UsersRepository, IdentityProviderRepository, PatRepository, LocalCredentialStore } from "@bernouy/cms-auth";
import {
    AUTH_ROUTES,
    authMethodsHandler,
    createAuthGuard,
    localLoginHandler,
    localLogoutHandler,
    oidcCallbackHandler,
    oidcLoginHandler,
    PUBLIC_AUTH_ROUTES,
    executeAuthSystemSourceEndpoint,
    registerPublicAuthRoutes,
} from "@bernouy/cms-auth";
import type { RolesRepository } from "@bernouy/cms-permissions";
import { ADMIN_ROLE, can, grantsFor, InMemoryRolesRepository, ValidatingRolesRepository } from "@bernouy/cms-permissions";
import type { SourceRepository } from "@bernouy/cms-sources";
import { CMS_SOURCES_ROUTE, SOURCE_PROXY_METHODS, sourcesPrefix, handleSourceRequest } from "@bernouy/cms-sources";
import type { DashboardRepository } from "@bernouy/cms-dashboards";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import {
    ANALYTICS_ROUTES,
    analyticsBreakdownHandler,
    analyticsSummaryHandler,
    analyticsTimeseriesHandler,
    analyticsTopPagesHandler,
    type AnalyticsStore,
} from "@bernouy/cms-analytics";
import type { CMS_ROLES } from "types/roles";
import serveStaticFolder from "./core/registerEndpoints/serveStaticFolder/serveStaticFolder";
import { serveApi } from "./core/registerEndpoints/serveApiFolder";
import { join } from "node:path";
import type { CspExtras } from "@bernouy/http-runner";
import { renderForbiddenPage, renderLoginPage } from "cms-control/core/auth/authPages";
import type {
    IntegrationDefinitionRepository,
    IntegrationInstanceRepository,
} from "@bernouy/cms-integrations";

type Configuration = {
    /**
     * Absolute URL of the Delivery service paired with this Control instance.
     * Used by admin UI surfaces that need to construct public-facing URLs
     * (Settings' MediaCenter preview, page share links…). In multi-tenant
     * setups each tenant's Control points at its own Delivery. Left
     * undefined when admin-only previews are not needed.
     */
    deliveryUrl?: string;
    /**
     * Optional unguarded first-party auth API used by admin login/reset/email
     * verification pages. Control disables public signup when mounting it; user
     * creation stays an admin API concern on this surface.
     */
    publicAuth?: PublicAuthRoutesConfig<CMS_ROLES>;
}

export type ControlCmsOptions = Configuration & {
    /** Optional catalogue of declarative integrations available to this
     *  Control surface. Runtimes can provide a local FS repository today and
     *  an HTTP-backed official repository later. */
    integrationCatalog?: IntegrationDefinitionRepository;
    /** Integration instance/run store. Runtimes must pass a durable repository
     *  before enabling the integration API. */
    integrationInstances?: IntegrationInstanceRepository;
    /** Dashboard store. Runtimes can inject a durable implementation; the
     *  default memory store keeps the admin surface bootable before persistence
     *  is wired. */
    dashboards?: DashboardRepository;
}

type ControlAuthBackends = {
    local?: LocalAuthentication<CMS_ROLES>;
    oidc?:  OidcAuthentication<CMS_ROLES>;
};

const EMPTY_INTEGRATION_CATALOG: IntegrationDefinitionRepository = {
    list:         async () => [],
    getIndex:     async () => null,
    listVersions: async () => [],
    get:          async () => null,
};

/**
 * Admin + API layer of the CMS. Mounts under whatever `basePath` the runner
 * carries — the consumer scopes the runner before passing it in:
 *
 *   rootRunner.group("/cms", (scoped) => {
 *       const control = new ControlCms(scoped, ...);
 *   });
 *
 * Multi-tenant follows the same pattern:
 *
 *   rootRunner.group(`/tenant-${id}/cms`, (scoped) => {
 *       const control = new ControlCms(scoped, ...);
 *   });
 *
 * `basePath` is exposed so admin-UI code can build absolute API URLs
 * without hard-coding any prefix.
 */
export class ControlCms {

    readonly ready: Promise<void>;

    private configuration:    ControlCmsOptions;
    private _repository:      CmsRepository;
    private _runner:          Runner;
    private _auth:            Authentication<CMS_ROLES>;
    private _cache:           Cache;
    private _secrets:         SecretStore;
    private _filesMetadata:   CmsFilesMetadataRepository | null;
    private _filesBlob:       CmsFilesBlobStore | null;
    private _users:               UsersRepository<CMS_ROLES> | null;
    private _identityProviders:   IdentityProviderRepository | null;
    private _pats:                PatRepository | null;
    private _credentials:         LocalCredentialStore | null;
    private _sources:             SourceRepository | null;
    private _analytics:           AnalyticsStore | null;
    private _roles:               RolesRepository;
    private _integrationCatalog: IntegrationDefinitionRepository;
    private _integrationInstances: IntegrationInstanceRepository | null;
    private _dashboards: DashboardRepository;

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
    ){
        this.configuration = configuration;
        this._auth = auth;
        this._runner = runner;
        this._repository = repository;
        this._cache = cache || new InMemoryCache();
        this._secrets = secrets || new ValidatingSecretStore(new InMemorySecretStore());
        this._filesMetadata = filesMetadata ?? null;
        this._filesBlob = filesBlob ?? null;
        this._users = users ?? null;
        this._identityProviders = identityProviders ?? null;
        this._pats = pats ?? null;
        this._credentials = credentials ?? null;
        this._sources = sources ?? null;
        this._analytics = analytics ?? null;
        this._roles = roles ?? new ValidatingRolesRepository(new InMemoryRolesRepository());
        this._integrationCatalog = configuration.integrationCatalog ?? EMPTY_INTEGRATION_CATALOG;
        this._integrationInstances = configuration.integrationInstances ?? null;
        this._dashboards = configuration.dashboards ?? new InMemoryDashboardRepository();
        this.ready = Promise.resolve();

        const authGuard = createAuthGuard<CMS_ROLES>({
            basePath:     this.basePath,
            auth:         this._auth,
            requiredRole: "admin",
            onForbidden:  (_req, ctx) => renderForbiddenPage(ctx.basePath, ctx.logoutUrl),
        });
        // Unguarded: the standalone login page. The guard redirects
        // unauthenticated users here via `buildLoginUrl`; registered before the
        // guarded groups so it is reachable without a session (first-match-wins).
        runner.addEndpoint("GET", "/login", (req) => renderLoginPage(req, this.basePath));

        const controlPublicAuth = this.configuration.publicAuth
            ? { ...this.configuration.publicAuth, allowSignup: false }
            : undefined;

        if (controlPublicAuth) {
            runner.group(PUBLIC_AUTH_ROUTES.base, (authRunner) => {
                registerPublicAuthRoutes(authRunner, controlPublicAuth);
            });
        }

        runner.group(AUTH_ROUTES.base, (authRunner) => {
            const supportedKinds: ("local" | "oidc")[] = [];
            if (authBackends.local) {
                supportedKinds.push("local");
                authRunner.addEndpoint("POST", AUTH_ROUTES.login,  (req) => localLoginHandler(authBackends.local!, req));
                authRunner.addEndpoint("GET",  AUTH_ROUTES.logout, (req) => localLogoutHandler(authBackends.local!, req));
            }
            if (authBackends.oidc) {
                supportedKinds.push("oidc");
                authRunner.addEndpoint("GET", AUTH_ROUTES.oidcLogin,    (req) => oidcLoginHandler(authBackends.oidc!, req));
                authRunner.addEndpoint("GET", AUTH_ROUTES.oidcCallback, (req) => oidcCallbackHandler(authBackends.oidc!, req));
            }
            authRunner.addEndpoint("GET", AUTH_ROUTES.methods, () => authMethodsHandler({
                publicBasePath:    `${this.basePath}${AUTH_ROUTES.base}`,
                identityProviders: this._identityProviders,
                supportedKinds,
            }));
        });

        // Bare tenant root / `/admin` land on the Pages list instead of the
        // empty index page. Guarded → unauth falls through to login.
        const toPages = () => redirect(`${this.basePath}/admin/pages`);
        runner.addEndpoint("GET", "/",      toPages, [authGuard]);
        runner.addEndpoint("GET", "/admin", toPages, [authGuard]);

        // Shared `.cms/*` mounts — the same feature handlers Delivery calls, here
        // admin-guarded: the editor preview + media library + source preview run
        // in the admin's same-origin session, so the guard passes. Registered
        // before the `/` and `/api` groups. Control alone wires the source
        // `resolveSecret` so `secret`-sourced headers resolve (delivery leaves it
        // unwired → clean 500).
        const resolveSecret = createSecretResolver(this._secrets);
        const resolveContext = async (req: Request) => {
            const subject = await this._auth.getSubject(req).catch(() => null);
            return subject ? { userID: subject.identifier } : {};
        };
        const authorizeEndpoint = async (endpoint: { urn: string }, req: Request) => {
            const subject = await this._auth.getSubject(req).catch(() => null);
            if (!subject) return false;
            if (subject.role === ADMIN_ROLE) return true;
            const definitions = await this._roles.list();
            return can(grantsFor(subject.role, { definitions }), endpoint.urn);
        };
        const executeSystemEndpoint = controlPublicAuth
            ? (endpoint: { urn: string; targetUrl: string }, req: Request) =>
                executeAuthSystemSourceEndpoint(controlPublicAuth, endpoint, req)
            : undefined;
        runner.group(CMS_SOURCES_ROUTE, (proxyRunner) => {
            const prefix = sourcesPrefix(runner.basePath);
            for (const method of SOURCE_PROXY_METHODS) {
                proxyRunner.setDefaultEndpoint(method, (req) =>
                    handleSourceRequest(this._sources, req, {
                        prefix,
                        deps: { resolveSecret, resolveContext, executeSystemEndpoint, authorizeEndpoint },
                    }));
            }
        }, [authGuard]);

        runner.group(CMS_FILES_ROUTE, (filesRunner) => {
            const prefix = filesPrefix(runner.basePath);
            filesRunner.setDefaultEndpoint("GET", (req) =>
                serveFilesRequest({ metadata: this.filesMetadata, blob: this.filesBlob }, req, { prefix }));
        }, [authGuard]);

        runner.addEndpoint("GET", "/.cms/style", (req) =>
            cachedResponseAsync(
                req,
                P9R_CACHE.STYLE,
                this._cache,
                () => generateStyleEntry(this._repository),
                publicAssetCacheControl(req),
            ),
        [authGuard]);

        runner.group("/", (staticRunner) => {
            serveStaticFolder(staticRunner, {
                cache:     this._cache,
                cspExtras: () => this.getCspExtras(),
            });
        }, [authGuard]);

        runner.group("/api", (apiRunner) => {
            serveApi(apiRunner, join(__dirname, "./api"), this);
            if (this._analytics) {
                const analytics = this._analytics;
                apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.summary,    (req) => analyticsSummaryHandler(analytics, req));
                apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.timeseries, (req) => analyticsTimeseriesHandler(analytics, req));
                apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.topPages,   (req) => analyticsTopPagesHandler(analytics, req));
                apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.breakdown,  (req) => analyticsBreakdownHandler(analytics, req));
            }
        }, [authGuard]);
    }

    get config(){
        return this.configuration;
    }

    get repository(){
        return this._repository;
    }

    get auth(){
        return this._auth;
    }

    get runner(){
        return this._runner;
    }

    get cache(){
        return this._cache;
    }

    get secrets(){
        return this._secrets;
    }

    /** File-tree metadata (folders + file records). Throws until a files
     *  backend is wired (media transition in progress). */
    get filesMetadata(): CmsFilesMetadataRepository {
        if (!this._filesMetadata) throw new Error("files metadata backend not configured");
        return this._filesMetadata;
    }

    /** Opaque byte storage for files. Throws until wired (see `filesMetadata`). */
    get filesBlob(): CmsFilesBlobStore {
        if (!this._filesBlob) throw new Error("files blob backend not configured");
        return this._filesBlob;
    }

    /** CMS membership store (authz: `sub → role`). Throws until wired. */
    get roles(): RolesRepository {
        return this._roles;
    }

    get users(): UsersRepository<CMS_ROLES> {
        if (!this._users) throw new Error("users repository not configured");
        return this._users;
    }

    /** Configured login providers (identity-as-data). Throws until wired. */
    get identityProviders(): IdentityProviderRepository {
        if (!this._identityProviders) throw new Error("identity providers repository not configured");
        return this._identityProviders;
    }

    /** Personal Access Tokens (CLI / server-to-server). Throws until wired. */
    get pats(): PatRepository {
        if (!this._pats) throw new Error("PAT repository not configured");
        return this._pats;
    }

    /** Local email/password credential store (authn secrets for the builtin
     *  `local` provider). Backs the admin "add user by hand" flow. Throws until
     *  wired. */
    get credentials(): LocalCredentialStore {
        if (!this._credentials) throw new Error("local credential store not configured");
        return this._credentials;
    }

    /** Public auth flow configuration (tokens + email transport/templates +
     *  frontend action URLs). Throws until wired by the composition root. */
    get publicAuth(): PublicAuthRoutesConfig<CMS_ROLES> {
        if (!this.configuration.publicAuth) throw new Error("public auth not configured");
        return this.configuration.publicAuth;
    }

    /** Declarative integration catalogue. */
    get integrationCatalog(): IntegrationDefinitionRepository {
        return this._integrationCatalog;
    }

    get integrationInstances(): IntegrationInstanceRepository {
        if (!this._integrationInstances) throw new Error("integration instances repository not configured");
        return this._integrationInstances;
    }

    get dashboards(): DashboardRepository {
        return this._dashboards;
    }

    /** Source store. Backs source reads and integration-created writes;
     *  must be the same instance Delivery reads. Throws until wired. */
    get sources(): SourceRepository {
        if (!this._sources) throw new Error("sources repository not configured");
        return this._sources;
    }

    /** Analytics store (reader). Backs the admin analytics dashboards;
     *  must be the same instance Delivery writes. Throws until wired. */
    get analytics(): AnalyticsStore {
        if (!this._analytics) throw new Error("analytics store not configured");
        return this._analytics;
    }

    /**
     * Tenant-level prefix, derived from `runner.basePath`. `"/"` (root-scoped
     * runner) becomes `""` so admin-UI code concatenating `${basePath}/api`
     * doesn't emit a double slash. Anything else (`"/cms"`, `"/tenant-1/cms"`)
     * is returned verbatim.
     */
    get basePath(){
        const base = this._runner.basePath;
        return base === "/" ? "" : base;
    }

    /**
     * CSP extras for admin HTML responses: combines the CDN's own public
     * origins (`media.origins`) with the user-managed
     * `system.security.{connect,media}Extras`. Resolved per-request from
     * `serveStaticFolder` so settings updates take effect without a
     * server restart.
     *
     */
    async getCspExtras(): Promise<CspExtras> {
        const settings = await this._repository.getSystem();
        return {
            connectExtras: [...settings.security.connectExtras],
            mediaExtras:   [...settings.security.mediaExtras],
        };
    }

}
