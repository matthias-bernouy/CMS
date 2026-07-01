import type { Runner } from "@bernouy/http-runner";
import { extname } from "node:path";
import type { Cache } from "@bernouy/http-runner";
import { cachedResponseAsync, compress, publicAssetCacheControl, securityHeaders } from "@bernouy/http-runner";
import type { CspExtras } from "@bernouy/http-runner";
import { scanStaticFolder } from "./scanStaticFolder";
import prepareHtml from "./prepareHtml";

export type ServeStaticFolderOptions = {
    /** Process-shared cache used to memoize compressed bytes per route. */
    cache: Cache;
    /**
     * Provider for the CSP extras to inject into HTML response headers
     * (admin pages). Resolved per-request so updates to the underlying
     * settings or media-origin take effect without restarting. Returns
     * `undefined` (or omits the option) to keep the static baseline.
     */
    cspExtras?: () => CspExtras | Promise<CspExtras>;
};

/**
 * Map of file extensions whose payload benefits from gzip/brotli (text-y
 * formats — JS, CSS, SVG, JSON). Anything not listed falls through to a
 * raw `Bun.file` response, since pre-compressed binaries (woff2, png,
 * jpg, …) gain nothing from a second compression pass and brotli would
 * actually inflate them slightly.
 */
const COMPRESSIBLE_TYPES: Record<string, string> = {
    ".js":   "text/javascript; charset=utf-8",
    ".mjs":  "text/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".svg":  "image/svg+xml; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt":  "text/plain; charset=utf-8",
    ".xml":  "application/xml; charset=utf-8",
    ".map":  "application/json; charset=utf-8",
};

export default async function serveStaticFolder(runner: Runner, options: ServeStaticFolderOptions) {

    const files = await scanStaticFolder();
    const cache = options.cache;

    for (const file of files) {

        if (file.relativePath.endsWith(".html")) {
            let routePath = file.relativePath.replace(/\.html$/, "");
            if (routePath === "index") {
                routePath = "/";
            } else if (routePath.endsWith("/index")) {
                routePath = routePath.slice(0, -5);
            }
            const finalRoute = routePath.startsWith("/") ? routePath : `/${routePath}`;
            const cachePrefix = `static-html:${finalRoute}`;

            runner.get(finalRoute, async (req: Request) => {
                // /editor/<resource> needs an `id` query param; without one the
                // client-side JS would hit /api/<resource> and 500 with
                // `MissingParam("id")`. Bounce the user to the matching admin
                // listing instead. Plural is just "+s" for the current set
                // (page, template).
                if (finalRoute.startsWith("/editor/")) {
                    const url = new URL(req.url);
                    if (!url.searchParams.get("id")) {
                        const resource = finalRoute.slice("/editor/".length);
                        const basePath = runner.basePath === "/" ? "" : runner.basePath;
                        return Response.redirect(`${basePath}/admin/${resource}s`, 302);
                    }
                }
                const extras = options.cspExtras ? await options.cspExtras() : undefined;
                const cacheKey = versionedStaticCacheKey(cachePrefix, file.absolutePath);
                return cachedResponseAsync(req, cacheKey, cache, async () => {
                    const html = await prepareHtml(file.absolutePath, runner);
                    return compress(html, "text/html; charset=utf-8");
                }, publicAssetCacheControl(req), { cspExtras: extras });
            });

            continue;
        }

        const ext = extname(file.relativePath).toLowerCase();
        const compressType = COMPRESSIBLE_TYPES[ext];

        if (compressType) {
            const cachePrefix = `static-asset:${file.relativePath}`;
            runner.get(file.relativePath, async (req: Request) => {
                const source = Bun.file(file.absolutePath);
                const cacheKey = `${cachePrefix}:${source.lastModified}`;
                return cachedResponseAsync(req, cacheKey, cache, async () => {
                    const bytes = new Uint8Array(await source.arrayBuffer());
                    return compress(bytes, compressType);
                }, publicAssetCacheControl(req));
            });
            continue;
        }

        // Pre-compressed binary (woff2, png, jpg, ico, …) — passthrough
        // with cache-control + security headers, no second compression pass.
        runner.get(file.relativePath, (req: Request) => {
            return new Response(Bun.file(file.absolutePath), {
                headers: {
                    ...securityHeaders(),
                    "Cache-Control": publicAssetCacheControl(req),
                },
            });
        });
    }
}

function versionedStaticCacheKey(prefix: string, path: string): string {
    return `${prefix}:${Bun.file(path).lastModified}`;
}
