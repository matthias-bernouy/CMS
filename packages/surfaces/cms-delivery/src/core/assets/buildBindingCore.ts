import { join } from "node:path";
import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";

/**
 * Source of the runtime-owned system-bloc bundle — the data-binding activation
 * root and browser-safe CMS controls registered on delivered pages.
 * Built like `component.js`: compiled once, cached, and served with a
 * content-hash URL so browsers can cache it immutably.
 */
const SOURCE = join(import.meta.dir, "../../endpoints/assets/bindingCore.client.ts");

export async function generateBindingCoreJsEntry(): Promise<CacheEntry> {
    // `conditions: ["bun"]` forces the `@bernouy/components/binding` import to
    // resolve via the package's `bun`→source export (as the Bun runtime does)
    // instead of falling back to `import`→`dist/index.js`. That keeps the
    // bundle to just the binding engine (~18KB, tree-shaken — vs ~60KB pulling
    // the bundled dist) AND reads LIVE source, so editing the engine reflects
    // without a cms-blocs rebuild.
    const result = await Bun.build({
        entrypoints: [SOURCE],
        format: "iife",
        conditions: ["bun"],
        minify: process.env.MODE === "PROD",
    });
    return compress(await result.outputs[0]!.text(), "text/javascript");
}
