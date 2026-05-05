import { type Runner, type MediaUrlBuilder, BunRunner } from "@bernouy/socle";
import type { Cache } from "src/socle/interfaces/Cache";
import { DeliveryCache } from "src/delivery/core/DeliveryCache";
import { PageEnhancer } from "src/delivery/core/enhance/PageEnhancer";
import { PlaywrightSession } from "src/delivery/core/enhance/PlaywrightSession";
import type { DeliveryRepository } from "./interfaces/DeliveryRepository";
import type { HeadInjector } from "./interfaces/HeadInjector";

export type DeliveryCmsConfig = {
    runner?:     Runner;
    media:       MediaUrlBuilder;
    repository:  DeliveryRepository;
    cache?:      Cache;
    /**
     * Shared Playwright session used by the page enhancer. Optional — when
     * absent, this instance creates and owns its own. Sharing one session
     * across many `DeliveryCms` instances (multi-tenant) is the expected
     * way to amortize the Chromium launch cost: passing the same
     * `PlaywrightSession` keeps a single browser process for every tenant.
     */
    playwrightSession?: PlaywrightSession;
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
 * Path layout for one Delivery instance:
 *   <basePath>/                — user pages, served by the default endpoint
 *   <basePath>/.cms/*          — Delivery's own assets
 *   <basePath>/robots.txt      — tenant-level crawler file
 *   <basePath>/sitemap.xml     — tenant-level sitemap
 *
 * `basePath` comes from `runner.basePath`. In single-tenant setups the
 * consumer can just pass a root runner (`basePath === "/"`). For multi-
 * tenant, scope the runner first:
 *
 *   const session = new PlaywrightSession();
 *   rootRunner.group("/tenant-1", (scoped) => {
 *       const delivery = new DeliveryCms({
 *           runner: scoped, playwrightSession: session, ...
 *       });
 *       registerDeliveryEndpoints(delivery);
 *   });
 *
 * Same server, N tenants, one shared Chromium.
 */
export default class DeliveryCms {

    private _runner:             Runner;
    private _media:              MediaUrlBuilder;
    private _repository:         DeliveryRepository;
    private _cache:              Cache;
    private _playwrightSession:  PlaywrightSession;
    private _ownsSession:        boolean;
    private _enhancer:           PageEnhancer;
    private _headInjectors:      readonly HeadInjector[];

    constructor(config: DeliveryCmsConfig){
        this._runner             = config.runner || new BunRunner();
        this._media              = config.media;
        this._repository         = config.repository;
        this._cache              = config.cache || new DeliveryCache();
        this._headInjectors      = config.headInjectors ?? [];

        if (config.playwrightSession) {
            this._playwrightSession = config.playwrightSession;
            this._ownsSession       = false;
        } else {
            this._playwrightSession = new PlaywrightSession();
            this._ownsSession       = true;
        }
        this._enhancer = new PageEnhancer(this, this._playwrightSession);
    }

    get runner(){
        return this._runner;
    }

    get media(){
        return this._media;
    }

    get repository(){
        return this._repository;
    }

    get cache(){
        return this._cache;
    }

    get enhancer(){
        return this._enhancer;
    }

    get headInjectors(){
        return this._headInjectors;
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

    /**
     * Graceful shutdown — closes the Playwright browser used by the page
     * enhancer only if it's owned by this instance. When the session was
     * injected (multi-tenant setup), closing is the consumer's
     * responsibility.
     */
    async close(): Promise<void> {
        if (this._ownsSession) await this._playwrightSession.close();
    }

}
