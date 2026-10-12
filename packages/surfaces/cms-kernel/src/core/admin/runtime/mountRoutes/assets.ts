import type { Cache, Runner } from "@bernouy/http-runner";
import { cachedResponseAsync, compress, publicAssetCacheControl } from "@bernouy/http-runner";
import { resolve } from "node:path";

const BROWSER_ROOT = resolve(import.meta.dir, "../../../../browser");

const ASSETS = [
    ["/assets/admin-runtime.js", "admin-runtime.js", "text/javascript; charset=utf-8"],
    ["/assets/admin-styles.css", "admin-styles.css", "text/css; charset=utf-8"],
] as const;

/** Mounts the explicit Admin kernel assets. Authored Admin pages never live here. */
export function mountAdminBrowserAssets(runner: Runner, cache: Cache): void {
    for (const [route, fileName, contentType] of ASSETS) {
        const path = resolve(BROWSER_ROOT, fileName);
        runner.get(route, (request) => {
            const source = Bun.file(path);
            return cachedResponseAsync(
                request,
                `admin-browser:${fileName}:${source.lastModified}`,
                cache,
                async () => compress(new Uint8Array(await source.arrayBuffer()), contentType),
                publicAssetCacheControl(request),
            );
        });
    }
}
