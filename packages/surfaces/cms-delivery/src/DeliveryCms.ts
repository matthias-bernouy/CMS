import type { Runner } from "@bernouy/http-runner";
import { BunRunner } from "@bernouy/http-runner";
import type { Cache } from "@bernouy/http-runner";
import type { CmsFilesMetadataRepository, CmsFilesBlobStore } from "@bernouy/cms-files";
import { P9R_CACHE } from "@bernouy/cms-content";
import type { GatewayRepository } from "@bernouy/cms-gateway";
import type { GatewaySecretResolver } from "@bernouy/cms-gateway";
import type { AnalyticsStore } from "@bernouy/cms-analytics";
import type { PublicAuthRoutesConfig } from "@bernouy/cms-auth";
import { TtlCache } from "@bernouy/http-runner";
import { OptimizeQueue } from "@bernouy/cms-files";
import { optimizePageImages } from "@bernouy/cms-files";
import { registerDeliveryEndpoints } from "cms-delivery/registerDeliveryEndpoints";
import type { ContentReader } from "@bernouy/cms-content";
import type { HeadInjector } from "./interfaces/HeadInjector";

export type DeliveryCmsConfig = {
    runner?:     Runner;
    repository:  ContentReader;
    cache?:      Cache;
    /**
     * Extension hook called by `renderPage` for each rendered document.
     * Each injector receives the linkedom document/head and the page's
     * bloc tag list, and may append elements to `<head>`. Injectors run in
     * registration order, right after `buildHtmlBasics` — i.e. they land
     * at the very top of <head>, before any preload, meta, stylesheet or
     * deferred script.
     *
     * Use cases: analytics tags, observability agents, A/B test snippets,
     * any third-party `<head>` content owned by the consumer rather than
     * by Delivery itself.
     */
    headInjectors?: readonly HeadInjector[];
    /**
     * Optional data-gateway provider store. When set, `/.cms/gateway/<provider>/<endpoint>`
     * resolves against it and proxies upstream; when absent, that route returns 501.
     */
    gateway?: GatewayRepository;
    /**
     * Optional secret resolver for gateway headers.
     *
     * Keep undefined for public deployments unless the composition root has
     * enforced the authentication/authorization policy around exposed providers.
     * `p9r dev` wires this from `site/.env` so local Supabase providers work.
     */
    gatewayResolveSecret?: GatewaySecretResolver;
    /**
     * Optional first-party public auth API. When set, Delivery mounts
     * `<basePath>/.cms/auth/*` for same-origin site signup/login/reset flows.
     * Auth stays separate from the data gateway: this is CMS identity, not an
     * author-configurable provider.
     */
    auth?: PublicAuthRoutesConfig<string>;
    /**
     * Optional analytics store (writer). When set, the page handler records a
     * page-view per request (fire-and-forget); when absent, collection is a no-op.
     */
    analytics?: AnalyticsStore;
    /**
     * Secret salting the cookieless visitor id (sha256(IP+UA+dailySalt)). Read
     * from ANALYTICS_SALT_SECRET at the composition root; share the same value
     * across instances for consistent unique-visitor counts. Absent → unsalted
     * (still cookieless and daily-rotating).
     */
    analyticsSalt?: string;
    /**
     * File-tree metadata + opaque byte storage backing the public
     * `<basePath>/.cms/files/<path>` route — the SAME instances Control writes
     * to. The route is always mounted; a hit throws (→ 500) until both are
     * wired, so wire both or neither.
     */
    filesMetadata?: CmsFilesMetadataRepository;
    filesBlob?:     CmsFilesBlobStore;
    /** Shared store for derived image variants (S3 prefix in prod). When wired,
     *  the `<basePath>/.cms/img/<id>/<width>.webp` route is mounted; otherwise
     *  the renderer falls back to the originals everywhere. */
    variantStore?:  CmsFilesBlobStore;
}

/**
 * Public-facing layer of the CMS. Serves rendered pages and their static
 * dependencies. Deliberately has no auth, no API, no admin surface — any
 * mutation goes through the separate admin/API layer and reaches Delivery
 * through the repository + an invalidation channel (TBD).
 *
 * Pages are resolved at request time by `handlePageRequest` against the
 * repository; Delivery does not maintain a route registry, so new pages
 * written admin-side are visible immediately (subject to cache invalidation).
 *
 * Runtime-only: every request renders fresh through `handlePageRequest`
 * and caches. A build-time pre-render pipeline used to live alongside this
 * package and was removed during the CmsCore refocus (image variants are
 * now generated at runtime in this class — see `optimizePage`).
 *
 * Path layout for one Delivery instance:
 *   <basePath>/                — user pages, served by the default endpoint
 *   <basePath>/.cms/*          — Delivery's own assets
 *   <basePath>/.cms/files/*    — file bytes (readable path → metadata → blob)
 *   <basePath>/.cms/gateway/*  — data-gateway proxy (when a gateway is configured)
 *   <basePath>/robots.txt      — tenant-level crawler file
 *   <basePath>/sitemap.xml     — tenant-level sitemap
 *
 * `basePath` comes from `runner.basePath`. In single-tenant setups the
 * consumer can just pass a root runner (`basePath === "/"`).
 */
export default class DeliveryCms {

    private _runner:             Runner;
    private _repository:         ContentReader;
    private _cache:              Cache;
    private _headInjectors:      readonly HeadInjector[];
    private _gateway?:           GatewayRepository;
    private _gatewayResolveSecret?: GatewaySecretResolver;
    private _auth?:              PublicAuthRoutesConfig<string>;
    private _analytics?:         AnalyticsStore;
    private _analyticsSalt?:     string;
    private _filesMetadata:      CmsFilesMetadataRepository | null;
    private _filesBlob:          CmsFilesBlobStore | null;
    private _variantStore:       CmsFilesBlobStore | null;
    private readonly _optimizeQueue = new OptimizeQueue();

    constructor(config: DeliveryCmsConfig){
        this._runner             = config.runner || new BunRunner();
        this._repository         = config.repository;
        this._cache              = config.cache || new TtlCache({ bypass: process.env.MODE === "DEV" });
        this._headInjectors      = config.headInjectors ?? [];
        this._gateway            = config.gateway;
        this._analytics          = config.analytics;
        this._analyticsSalt      = config.analyticsSalt;
        this._auth               = config.auth;
        this._filesMetadata      = config.filesMetadata ?? null;
        this._filesBlob          = config.filesBlob ?? null;
        this._variantStore       = config.variantStore ?? null;
        this._gatewayResolveSecret = config.gatewayResolveSecret;

        registerDeliveryEndpoints(this);
    }

    get runner(){
        return this._runner;
    }

    get repository(){
        return this._repository;
    }

    get cache(){
        return this._cache;
    }

    get headInjectors(){
        return this._headInjectors;
    }

    /** Data-gateway provider store, or `undefined` when no gateway is configured. */
    get gateway(){
        return this._gateway;
    }

    /** Secret resolver for Delivery gateway headers, when explicitly wired. */
    get gatewayResolveSecret(){
        return this._gatewayResolveSecret;
    }

    /** Public auth API config, or `undefined` when not mounted. */
    get auth(){
        return this._auth;
    }

    /** Analytics store (writer), or `undefined` when analytics is not configured. */
    get analytics(){
        return this._analytics;
    }

    /** Secret for the visitor-id daily salt, or `undefined` when unset. */
    get analyticsSalt(){
        return this._analyticsSalt;
    }

    /** File-tree metadata (folders + file records) for the `.cms/files` route.
     *  Throws until a files backend is wired (media transition in progress). */
    get filesMetadata(): CmsFilesMetadataRepository {
        if (!this._filesMetadata) throw new Error("files metadata backend not configured");
        return this._filesMetadata;
    }

    /** Like `filesMetadata` but `null` instead of throwing when unconfigured —
     *  for optional consumers such as the renderer's media-version injection. */
    get filesMetadataOrNull(): CmsFilesMetadataRepository | null {
        return this._filesMetadata;
    }

    /** Derived image-variant store, or `null` when unconfigured (the variant
     *  route is then not mounted and the renderer serves originals). */
    get variantStoreOrNull(): CmsFilesBlobStore | null {
        return this._variantStore;
    }

    /**
     * Enqueue background variant generation for a page's not-yet-optimized
     * images, then invalidate that page so the next render emits the responsive
     * `srcset`. Fire-and-forget; deduped per path. No-op until files + variant
     * backends are wired. The invalidation is reliable here — unlike Control, the
     * worker runs IN the Delivery process, so it clears the cache it serves from.
     */
    optimizePage(path: string, imageIds: string[]): void {
        if (!this._filesMetadata || !this._filesBlob || !this._variantStore || imageIds.length === 0) return;
        const deps = { metadata: this._filesMetadata, sourceBlob: this._filesBlob, variantStore: this._variantStore };
        this._optimizeQueue.enqueue(path, async () => {
            await optimizePageImages(deps, imageIds);
            this._cache.delete(P9R_CACHE.page(path));
        });
    }

    /** Opaque byte storage for files. Throws until wired (see `filesMetadata`). */
    get filesBlob(): CmsFilesBlobStore {
        if (!this._filesBlob) throw new Error("files blob backend not configured");
        return this._filesBlob;
    }

    /** Like `filesBlob` but `null` instead of throwing — for the optional
     *  image-variant mount guard. */
    get filesBlobOrNull(): CmsFilesBlobStore | null {
        return this._filesBlob;
    }

    /**
     * Tenant-level prefix, derived from `runner.basePath`. `"/"` (root-scoped
     * runner) becomes `""` so emitted URLs don't start with `//`. Anything
     * else (`"/tenant-1"`, …) is returned verbatim.
     */
    get basePath(){
        const base = this._runner.basePath;
        return base === "/" ? "" : base;
    }

    /**
     * Asset sub-prefix: tenant base + `"/.cms"`. This is where bloc bundles,
     * theme CSS, the component runtime and the default favicon live, and
     * what every rendered page references. Never empty — the `/.cms`
     * segment is always present.
     */
    get cmsPathPrefix(){
        return this.basePath + "/.cms";
    }

}
