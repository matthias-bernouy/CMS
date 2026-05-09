import type { Authentication, CDN, Runner } from "@bernouy/core";
import type { CmsRepository } from "../socle/interfaces/CmsRepository";
import type { Cache } from "../socle/interfaces/Cache";
import { InMemoryCache } from "../socle/default-implementation/Cache/memory";
import type { SecretStore } from "../socle/interfaces/SecretStore";
import { InMemorySecretStore } from "../socle/default-implementation/SecretStore/memory";
import type { ProxyPublisher } from "../socle/interfaces/ProxyPublisher";
import type { CMS_ROLES } from "types/roles";
import serveStaticFolder from "./core/registerEndpoints/serveStaticFolder/serveStaticFolder";
import { serveApi } from "./core/registerEndpoints/serveApiFolder";
import { join } from "node:path"
import { buildMediaHydrationScript } from "./core/authentication/buildMediaHydrationScript";
import { createAuthGuard } from "./core/authentication/authGuard";
import { compress, publicAssetCacheControl, sendCompressed } from "../socle/server/compression";
import type { CspExtras } from "../socle/server/buildCspContent";
import { SpecCache } from "./core/data/SpecCache";

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
    private _secrets:         SecretStore;
    private _specCache:       SpecCache;
    private _proxyPublisher:  ProxyPublisher | null;

    constructor(
        runner: Runner,
        repository: CmsRepository,
        auth: Authentication<CMS_ROLES>,
        media: CDN,
        configuration: Configuration,
        cache?: Cache,
        secrets?: SecretStore,
        proxyPublisher?: ProxyPublisher,
    ){
        this.configuration = configuration;
        this._auth = auth;
        this._runner = runner;
        this._repository = repository;
        this._media = media;
        this._cache = cache || new InMemoryCache();
        this._secrets = secrets || new InMemorySecretStore();
        this._specCache = new SpecCache();
        this._proxyPublisher = proxyPublisher ?? null;

        // Hydration is served as a real `<script src=…>` (CSP-friendly:
        // `default-src 'self'` rejects inline scripts). Pre-compressed once
        // at boot — content depends only on the Media instance, which is
        // fixed for this ControlCms's lifetime. Each tenant has its own
        // ControlCms, so each gets its own hydration entry in their cache.
        const hydrationEntry = compress(
            buildMediaHydrationScript(this["_media"]),
            "text/javascript; charset=utf-8",
        );
        const authGuard = createAuthGuard(this);

        runner.group("/_cms", (cmsRunner) => {
            cmsRunner.get("/hydration.js", (req: Request) => {
                return sendCompressed(req, hydrationEntry, publicAssetCacheControl(req));
            });
        }, [authGuard]);

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

    get secrets(){
        return this._secrets;
    }

    get specCache(){
        return this._specCache;
    }

    /** Optional outbound channel that publishes proxy rules to the
     *  upstream CDN/edge layer. `null` when the deployment doesn't have
     *  a CDN paired (e.g. dev / single-tenant on localhost) — the
     *  data-provider mutations no-op the publish step in that case. */
    get proxyPublisher(){
        return this._proxyPublisher;
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
     * Each `media.origins` entry lands in BOTH `connect-src` (uploads,
     * listing fetches) and `media-src` (so a future `<video>` served
     * from the CDN can play).
     */
    async getCspExtras(): Promise<CspExtras> {
        const settings = await this._repository.getSystem();
        const connect  = new Set<string>(settings.security.connectExtras);
        const media    = new Set<string>(settings.security.mediaExtras);
        for (const origin of this._media.origins) {
            connect.add(origin);
            media.add  (origin);
        }
        return { connectExtras: [...connect], mediaExtras: [...media] };
    }

}
