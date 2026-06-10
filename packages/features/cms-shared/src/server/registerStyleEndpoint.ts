import type { Runner, Middleware } from "@bernouy/http-runner";
import type { Cache, CacheEntry } from "@bernouy/http-runner";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { P9R_CACHE } from "cms-shared/constants/p9r-constants";

/**
 * Mount the theme CSS route at `<basePath>/.cms/style` on `runner`, cached under
 * `P9R_CACHE.STYLE`. Called by both Control (admin-guarded preview) and Delivery
 * (public). The CSS producer is injected as `generate` so each side keeps its own
 * repository/compression path — Delivery passes the SAME `generateStyleEntry` it
 * uses to derive the `?v=<hash>` link, guaranteeing the served bytes match the hash.
 */
export function registerStyleEndpoint(opts: {
    runner:       Runner;
    cache:        Cache;
    generate:     () => Promise<CacheEntry>;
    middlewares?: Middleware[];
}): void {
    opts.runner.addEndpoint("GET", "/.cms/style", (req) =>
        cachedResponseAsync(req, P9R_CACHE.STYLE, opts.cache, opts.generate, publicAssetCacheControl(req)),
        opts.middlewares);
}
