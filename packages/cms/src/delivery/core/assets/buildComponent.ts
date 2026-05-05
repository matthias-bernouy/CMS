import { join } from "node:path";
import type { CacheEntry } from "src/socle/interfaces/Cache";
import { compress } from "src/socle/server/compression";

/**
 * Source of the component runtime bundle. Lives under `endpoints/assets/`
 * because it's the entry a browser loads; building the bundle stays here
 * in `core/` with the other generators.
 */
const SOURCE = join(import.meta.dir, "../../endpoints/assets/component.client.ts");

/**
 * Build the `component.js` bundle — the runtime that exposes
 * `window.p9r.Component` to every bloc IIFE. Compiled once, cached, and
 * served with a content-hash URL so browsers can cache it forever.
 */
export async function generateComponentJsEntry(): Promise<CacheEntry> {
    const result = await Bun.build({ entrypoints: [SOURCE], format: "iife" });
    return compress(await result.outputs[0]!.text(), "text/javascript");
}
