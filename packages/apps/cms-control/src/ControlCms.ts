import type { Authentication, Runner } from "@bernouy/core";
import { redirect } from "@bernouy/core";
import type { CmsRepository } from "@bernouy/cms-shared";
import type { Cache } from "@bernouy/cms-shared";
import { InMemoryCache } from "@bernouy/cms-shared";
import type { SecretStore } from "@bernouy/cms-shared";
import { InMemorySecretStore } from "@bernouy/cms-shared";
import type { CmsFilesMetadataRepository } from "@bernouy/cms-shared";
import type { CmsFilesBlobStore } from "@bernouy/cms-shared";
import type { UsersRepository, IdentityProviderRepository, PatRepository, LocalCredentialStore } from "@bernouy/auth-core";
import { createAuthGuard, renderLoginPage, toLoginMethod } from "@bernouy/auth-core";
import type { GatewayRepository } from "@bernouy/cms-gateway";
import type { CMS_ROLES } from "types/roles";
import serveStaticFolder from "./core/registerEndpoints/serveStaticFolder/serveStaticFolder";
import { serveApi } from "./core/registerEndpoints/serveApiFolder";
import { join } from "node:path"
import type { CspExtras } from "@bernouy/cms-shared";

type Configuration = {
    /**
     * Absolute URL of the Delivery service paired with this Control instance.
     * Used by admin UI surfaces that need to construct public-facing URLs
     * (Settings' MediaCenter preview, page share links…). In multi-tenant
     * setups each tenant's Control points at its own Delivery. Left
     * undefined when admin-only previews are not needed.
     */
    deliveryUrl?: string;
}

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

    private configuration:    Configuration;
    private _repository:      CmsRepository;
    private _runner:          Runner;
    private _auth:            Authentication;
    private _cache:           Cache;
    private _secrets:         SecretStore;
    private _filesMetadata:   CmsFilesMetadataRepository | null;
    private _filesBlob:       CmsFilesBlobStore | null;
    private _users:               UsersRepository<CMS_ROLES> | null;
    private _identityProviders:   IdentityProviderRepository | null;
    private _pats:                PatRepository | null;
    private _credentials:         LocalCredentialStore | null;
    private _gateway:             GatewayRepository | null;

    constructor(
        runner: Runner,
        repository: CmsRepository,
        auth: Authentication<CMS_ROLES>,
        configuration: Configuration,
        cache?: Cache,
        secrets?: SecretStore,
        filesMetadata?: CmsFilesMetadataRepository,
        filesBlob?: CmsFilesBlobStore,
        users?: UsersRepository<CMS_ROLES>,
        identityProviders?: IdentityProviderRepository,
        pats?: PatRepository,
        credentials?: LocalCredentialStore,
        gateway?: GatewayRepository,
    ){
        this.configuration = configuration;
        this._auth = auth;
        this._runner = runner;
        this._repository = repository;
        this._cache = cache || new InMemoryCache();
        this._secrets = secrets || new InMemorySecretStore();
        this._filesMetadata = filesMetadata ?? null;
        this._filesBlob = filesBlob ?? null;
        this._users = users ?? null;
        this._identityProviders = identityProviders ?? null;
        this._pats = pats ?? null;
        this._credentials = credentials ?? null;
        this._gateway = gateway ?? null;

        const authGuard = createAuthGuard<CMS_ROLES>({ basePath: this.basePath, auth: this._auth, requiredRole: "admin" });

        // Unguarded: the standalone login page. The guard redirects
        // unauthenticated users here via `buildLoginUrl`; registered before the
        // guarded groups so it is reachable without a session (first-match-wins).
        runner.addEndpoint("GET", "/login", (req) => renderLoginPage(req, this.basePath));

        // Unguarded discovery: the enabled login methods, consumed by the login
        // page (and auth blocs) to render the local form + provider buttons.
        runner.addEndpoint("GET", "/auth/methods", async () => {
            const providers = this._identityProviders ? await this._identityProviders.list() : [];
            const methods = providers.filter((p) => p.enabled).map((p) => toLoginMethod(p, `${this.basePath}/auth`));
            return Response.json(methods);
        });

        // Bare tenant root / `/admin` land on the Pages list instead of the
        // empty index page. Guarded → unauth falls through to login.
        const toPages = () => redirect(`${this.basePath}/admin/pages`);
        runner.addEndpoint("GET", "/",      toPages, [authGuard]);
        runner.addEndpoint("GET", "/admin", toPages, [authGuard]);

        runner.group("/", (staticRunner) => {
            serveStaticFolder(staticRunner, {
                cache:     this._cache,
                cspExtras: () => this.getCspExtras(),
            });
        }, [authGuard]);

        runner.group("/api", (apiRunner) => {
            serveApi(apiRunner, join(__dirname, "./api"), this);
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

    /** Gateway provider store (data-gateway). Backs the admin provider CRUD;
     *  must be the same instance Delivery reads. Throws until wired. */
    get gateway(): GatewayRepository {
        if (!this._gateway) throw new Error("gateway repository not configured");
        return this._gateway;
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
