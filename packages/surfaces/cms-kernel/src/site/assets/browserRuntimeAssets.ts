import { join } from "node:path";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import { compress, type CacheEntry } from "@bernouy/http-runner";

const ASSET_DIRECTORY = join(import.meta.dir, "generated");

export async function loadComponentRuntimeEntry(): Promise<CacheEntry> {
    return loadBrowserRuntimeEntry("component.js");
}

export async function loadBindingCoreRuntimeEntry(): Promise<CacheEntry> {
    return loadBrowserRuntimeEntry("binding-core.js");
}

export function componentRuntimeCacheKey(pathname: string): string {
    return CMS_CACHE_KEYS.js(pathname);
}

async function loadBrowserRuntimeEntry(filename: string): Promise<CacheEntry> {
    const file = Bun.file(join(ASSET_DIRECTORY, filename));
    if (!(await file.exists())) {
        throw new Error(`Kernel browser runtime ${filename} is missing; run bun run build`);
    }
    return compress(await file.text(), "text/javascript");
}
