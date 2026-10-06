import type { Cache, Runner } from "@bernouy/http-runner";
import { cachedResponseAsync, compress, publicAssetCacheControl } from "@bernouy/http-runner";
import { resolve } from "node:path";

const BROWSER_ROOT = resolve(import.meta.dir, "../../../../browser");

const ASSETS = [
    ["/assets/control-runtime.js", "control-runtime.js", "text/javascript; charset=utf-8"],
    ["/assets/control-styles.css", "control-styles.css", "text/css; charset=utf-8"],
] as const;

/** Mounts the explicit Control kernel assets. Authored Control pages never live here. */
export function mountControlBrowserAssets(runner: Runner, cache: Cache): void {
    for (const [route, fileName, contentType] of ASSETS) {
        const path = resolve(BROWSER_ROOT, fileName);
        runner.get(route, (request) => {
            const source = Bun.file(path);
            return cachedResponseAsync(
                request,
                `control-browser:${fileName}:${source.lastModified}`,
                cache,
                async () => compress(new Uint8Array(await source.arrayBuffer()), contentType),
                publicAssetCacheControl(request),
            );
        });
    }
}
