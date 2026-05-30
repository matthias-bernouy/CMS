import type { Runner } from "@bernouy/core";
import { BunRunner } from "@bernouy/runner-bun";
import type { Cache } from "@bernouy/cms-shared";
import type { GatewayRepository } from "@bernouy/cms-gateway";
import { DeliveryCache } from "cms-delivery/core/DeliveryCache";
import { registerDeliveryEndpoints } from "cms-delivery/registerDeliveryEndpoints";
import type { DeliveryRepository } from "./interfaces/DeliveryRepository";
import type { HeadInjector } from "./interfaces/HeadInjector";

export type DeliveryCmsConfig = {
    runner?:     Runner;
    repository:  DeliveryRepository;
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
 * and caches. A build-time pre-render / image-variant pipeline used to
 * live alongside this package and was removed during the CmsCore refocus.
 *
 * Path layout for one Delivery instance:
 *   <basePath>/                — user pages, served by the default endpoint
 *   <basePath>/.cms/*          — Delivery's own assets
 *   <basePath>/.cms/gateway/*  — data-gateway proxy (when a gateway is configured)
 *   <basePath>/robots.txt      — tenant-level crawler file
 *   <basePath>/sitemap.xml     — tenant-level sitemap
 *
 * `basePath` comes from `runner.basePath`. In single-tenant setups the
 * consumer can just pass a root runner (`basePath === "/"`).
 */
export default class DeliveryCms {

    private _runner:             Runner;
    private _repository:         DeliveryRepository;
    private _cache:              Cache;
    private _headInjectors:      readonly HeadInjector[];
    private _gateway?:           GatewayRepository;

    constructor(config: DeliveryCmsConfig){
        this._runner             = config.runner || new BunRunner();
        this._repository         = config.repository;
        this._cache              = config.cache || new DeliveryCache();
        this._headInjectors      = config.headInjectors ?? [];
        this._gateway            = config.gateway;

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
