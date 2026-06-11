import type { Runner, Middleware } from "@bernouy/http-runner";
import type { Cache } from "@bernouy/http-runner";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { P9R_CACHE } from "cms-content/core/constants/p9r-constants";
import type { ContentReader } from "cms-content/interfaces/ContentReader";
import { generateStyleEntry } from "cms-content/http/generateStyleEntry";

/**
 * Mount the theme CSS route at `<basePath>/.cms/style` on `runner`, cached under
 * `P9R_CACHE.STYLE`. Called by both Control (admin-guarded preview) and
 * Delivery (public). The same producer is also used by Delivery to derive the
 * `?v=<hash>` link, guaranteeing the served bytes match the hash.
 */
export function registerStyleEndpoint(opts: {
    runner:       Runner;
    cache:        Cache;
    repository:   ContentReader;
    middlewares?: Middleware[];
}): void {
    opts.runner.addEndpoint("GET", "/.cms/style", (req) =>
        cachedResponseAsync(req, P9R_CACHE.STYLE, opts.cache, () => generateStyleEntry(opts.repository), publicAssetCacheControl(req)),
        opts.middlewares);
}
