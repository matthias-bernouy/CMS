import type { Authentication, CDN, Runner } from "@bernouy/core";
import type { CmsRepository } from "../socle/interfaces/CmsRepository";
import type { Cache } from "../socle/interfaces/Cache";
import { InMemoryCache } from "../socle/default-implementation/Cache/memory";
import type { CMS_ROLES } from "types/roles";
import serveStaticFolder from "./core/registerEndpoints/serveStaticFolder/serveStaticFolder";
import { serveApi } from "./core/registerEndpoints/serveApiFolder";
import { join } from "node:path"
import { buildMediaHydrationScript } from "./core/authentication/buildMediaHydrationScript";
import { createAuthGuard } from "./core/authentication/authGuard";

type Configuration = {
    /**
     * Absolute URL to the external token management interface. Surfaced on
     * the admin Profile page as the "Manage tokens" button. Required:
     * deliberately a CMS-level config rather than pulled from
     * `auth.profileUrl` because that Socle contract is too ambiguous
     * (profile vs tokens vs account management).
     */
    tokensUrl: string;
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
    private _media:           CDN;
    private _cache:           Cache;

    constructor(
        runner: Runner,
        repository: CmsRepository,
        auth: Authentication<CMS_ROLES>,
        media: CDN,
        configuration: Configuration,
        cache?: Cache
    ){
        this.configuration = configuration;
        this._auth = auth;
        this._runner = runner;
        this._repository = repository;
        this._media = media;
        this._cache = cache || new InMemoryCache();

        // Hydration is inlined in the served HTML page (template's
        // {{HYDRATION}} token), NOT appended to the shared static bundle.
        // This is the only way `window._cms.CDN` is in scope before the
        // bundle's first `connectedCallback` runs, AND it lets each
        // ControlCms instance ship its own hydration in a multi-tenant
        // deployment without the tenants stomping on each other.
        const hydrationScript = buildMediaHydrationScript(this["_media"]);
        const authGuard = createAuthGuard(this);

        runner.group("/", (staticRunner) => {
            serveStaticFolder(staticRunner, { hydrationScript });
        }, [authGuard]);

        runner.group("/api", (apiRunner) => {
            serveApi(apiRunner, join(__dirname, "./api"), this);
        }, [authGuard]);
    }

    get media(){
        return this._media;
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

}
