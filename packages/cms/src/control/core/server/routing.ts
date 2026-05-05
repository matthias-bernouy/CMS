import type { Runner } from "@bernouy/socle";
import { basename, dirname, join } from "node:path";
import type { ControlCms } from "src/control/ControlCms";
import { cachedResponseAsync, compress, SECURITY_HEADERS } from "src/socle/server/compression";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";

// Mirrors the union accepted by socle's `Runner.addEndpoint`. Centralized
// here so the API-folder router can validate filenames against it without
// an `as any` cast in two places.
export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
const ALLOWED_METHODS: readonly HTTPMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

function isHTTPMethod(s: string): s is HTTPMethod {
    return (ALLOWED_METHODS as readonly string[]).includes(s);
}

export async function registerUIFolder(baseUrl: string, absolutePath: string, cms: ControlCms, runner: Runner) {
    type PageEntry = { serverFile?: string; clientFile?: string; htmlFile?: string };
    const pages = new Map<string, PageEntry>();

    const fileTypes = [
        { glob: "**/*.html",      suffix: ".html",      key: "htmlFile"   },
        { glob: "**/*.server.ts", suffix: ".server.ts", key: "serverFile" },
        { glob: "**/*.client.ts", suffix: ".client.ts", key: "clientFile" },
    ] as const;

    for (const { glob, suffix, key } of fileTypes) {
        for await (const file of new Bun.Glob(glob).scan(absolutePath)) {
            const routeKey = toRouteKey(file, suffix);
            const entry = pages.get(routeKey) || {};
            (entry as any)[key] = join(absolutePath, file);
            pages.set(routeKey, entry);
        }
    }

    for (const [routeKey, { serverFile, clientFile, htmlFile }] of pages) {
        const urlPath = join(baseUrl, routeKey).replace(/\\/g, '/');

        if (serverFile) {
            const module = await import(serverFile);
            const serverHandler = module.default as (req: Request, cms: ControlCms) => Promise<Response>;
            runner.addEndpoint("GET", urlPath, async (req: Request) => {
                const response = await serverHandler(req, cms);
                return injectMediaClientIntoHtml(response, cms.basePath);
            });
        } else if (htmlFile) {
            const cacheKey = P9R_CACHE.html(urlPath);
            const basePath = cms.basePath;
            runner.addEndpoint("GET", urlPath, async (req: Request) => {
                return cachedResponseAsync(req, cacheKey, cms.cache, async () => {
                    const content = await Bun.file(htmlFile).text();
                    return compress(injectMediaClientScript(content, basePath), "text/html");
                });
            });
        }

        if (clientFile) {
            const cacheKey = P9R_CACHE.js(urlPath);
            runner.addEndpoint("GET", urlPath + ".js", async (req: Request) => {
                return cachedResponseAsync(req, cacheKey, cms.cache, async () => {
                    const result = await Bun.build({ entrypoints: [clientFile], format: "iife" });
                    return compress(await result.outputs[0]!.text(), "text/javascript");
                });
            });
        }
    }
}

function toRouteKey(filePath: string, suffix: string): string {
    const base = filePath.slice(0, -suffix.length);
    const dir = dirname(base);
    const name = basename(base);

    if (dir === ".") return name;
    if (name === basename(dir)) return dir;
    return base;
}

/**
 * Inserts `<script src="<basePath>/_cms/media.js"></script>` right after the
 * `<head>` opening tag — synchronous, non-deferred, first script executed on
 * the page — so `window._cms.Media` is guaranteed to be available before any
 * subsequent admin script reads it. The Media bootstrap has no dependencies
 * of its own, so blocking parsing for its fetch is cheap and worth the
 * simplicity. Runs once at HTML build time for static pages (cached); runs
 * per-request for server-rendered pages but only when the response carries
 * `Content-Type: text/html` so JSON/JS responses pass through untouched.
 */
function injectMediaClientScript(html: string, basePath: string): string {
    const tag = `<script src="${basePath}/_cms/media.js"></script>`;
    const match = html.match(/<head[^>]*>/i);
    if (!match || match.index === undefined) return html;
    const idx = match.index + match[0].length;
    return html.slice(0, idx) + tag + html.slice(idx);
}

async function injectMediaClientIntoHtml(response: Response, basePath: string): Promise<Response> {
    const contentType = response.headers.get("Content-Type") ?? "";
    if (!contentType.includes("text/html")) return response;
    const body = await response.text();
    const injected = injectMediaClientScript(body, basePath);
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    return new Response(injected, { status: response.status, headers });
}


/**
 * Serve every file under `absoluteFolderPath` verbatim. Content-Type is
 * inferred from the file extension by `Bun.file`. No compression and no
 * in-memory caching — the admin is authenticated, low-traffic, and `.woff2`
 * is already Brotli-compressed internally anyway. Attach security headers
 * so the response matches the posture of the rest of the admin surface.
 *
 * Subfolders are preserved: a file at `<root>/css/style.css` is served at
 * `<url>/css/style.css`. This keeps relative `@import` and `url()`
 * references inside CSS working without rewrites.
 */
export async function registerResourcesFolder(url: string, absoluteFolderPath: string, runner: Runner) {
    const glob = new Bun.Glob("**/*");

    for await (const file of glob.scan(absoluteFolderPath)) {
        const fullPath = join(absoluteFolderPath, file);
        const endpointUrl = join(url, file).replace(/\\/g, '/');
        runner.addEndpoint("GET", endpointUrl, async () => {
            return new Response(Bun.file(fullPath), { headers: SECURITY_HEADERS });
        });
    }
}

export async function registerAPIFolder(url: string, absoluteFolderPath: string, cms: ControlCms, runner: Runner) {
    const glob = new Bun.Glob("**/*.ts");

    for await (const file of glob.scan(absoluteFolderPath)) {
        const fullPath = join(absoluteFolderPath, file);
        
        const parts = file.split('.');
        
        const baseName = parts[0] || "";
        const rawMethod = parts[1]?.toUpperCase() || "GET";
        if (!isHTTPMethod(rawMethod)) {
            console.warn(`[API] Ignored "${file}" — unknown HTTP method "${rawMethod}"`);
            continue;
        }
        const method: HTTPMethod = rawMethod;
        const endpointUrl = join(url, baseName).replace(/\\/g, '/');

        const module = await import(fullPath);
        const handler = module.default;

        if (typeof handler === 'function') {
            runner.addEndpoint(method, endpointUrl, (req: Request) => {
                return handler(req, cms)
            });
        } else {
            console.warn(`[API] No default export found in ${file}`);
        }
    }
}