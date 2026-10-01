import { join } from "node:path";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";

/**
 * Source of the component runtime bundle. Lives under `endpoints/assets/`
 * because it's the entry a browser loads; building the bundle stays here
 * in `core/` with the other generators.
 */
const SOURCE = join(import.meta.dir, "../../endpoints/assets/component.client.ts");

/**
 * Build the `component.js` bundle — the runtime that exposes
 * `window.cmsRuntime.Component` to every Bloc IIFE.
 * Compiled once, cached, and
 * served with a content-hash URL so browsers can cache it forever.
 */
export async function generateComponentJsEntry(): Promise<CacheEntry> {
    const result = await Bun.build({
        entrypoints: [SOURCE],
        format: "iife",
        minify: process.env.MODE === "PROD",
    });
    return compress(await result.outputs[0]!.text(), "text/javascript");
}

export function componentJsCacheKey(pathname: string): string {
    return CMS_CACHE_KEYS.js(pathname);
}
