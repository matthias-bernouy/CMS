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
    // Resolve the browser entry directly from cms-content source so editing the
    // binding engine is reflected without rebuilding a separate UI package.
    const result = await Bun.build({
        entrypoints: [SOURCE],
        format: "iife",
        conditions: ["bun"],
        minify: process.env.MODE === "PROD",
    });
    return compress(await result.outputs[0]!.text(), "text/javascript");
}
