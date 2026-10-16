import { join } from "node:path";
import { compress, type CacheEntry } from "@bernouy/http-runner";
import { CMS_CACHE_KEYS } from "cms-content/application/core/cacheKeys";

const ASSET_DIRECTORY = join(import.meta.dir, "generated");

export async function loadBlocRuntimeEntry(): Promise<CacheEntry> {
    return loadBrowserRuntimeEntry("bloc-runtime.js");
}

export async function loadBindingCoreRuntimeEntry(): Promise<CacheEntry> {
    return loadBrowserRuntimeEntry("binding-core.js");
}

export function blocRuntimeCacheKey(pathname: string): string {
    return CMS_CACHE_KEYS.js(pathname);
}

async function loadBrowserRuntimeEntry(filename: string): Promise<CacheEntry> {
    const file = Bun.file(join(ASSET_DIRECTORY, filename));
    if (!(await file.exists())) {
        throw new Error(`CMS browser runtime ${filename} is missing; run bun run build`);
    }
    return compress(await file.text(), "text/javascript");
}
