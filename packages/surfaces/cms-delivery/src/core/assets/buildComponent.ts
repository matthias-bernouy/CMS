import { join } from "node:path";
import { P9R_CACHE } from "@bernouy/cms-content";
import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";
import type { ResponsiveSourceImageRollout } from "@bernouy/cms-source-images/browser-host";

/**
 * Source of the component runtime bundle. Lives under `endpoints/assets/`
 * because it's the entry a browser loads; building the bundle stays here
 * in `core/` with the other generators.
 */
const SOURCE = join(import.meta.dir, "../../endpoints/assets/component.client.ts");

/**
 * Build the `component.js` bundle — the runtime that exposes
 * `window.p9r.Component` and `window.p9r.Composition` to every bloc IIFE.
 * Compiled once, cached, and
 * served with a content-hash URL so browsers can cache it forever.
 */
export const RESPONSIVE_SOURCE_IMAGE_ROLLOUT_VARIANTS: readonly ResponsiveSourceImageRollout[] = [
    { public: false, private: false },
    { public: true, private: false },
    { public: true, private: true },
    { public: false, private: true },
];

export async function generateComponentJsEntry(
    rollout: ResponsiveSourceImageRollout = { public: false, private: false },
): Promise<CacheEntry> {
    const result = await Bun.build({
        entrypoints: [SOURCE],
        format: "iife",
        minify: process.env.MODE === "PROD",
        define: {
            __CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED__: String(rollout.public),
            __CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED__: String(rollout.private),
        },
    });
    return compress(await result.outputs[0]!.text(), "text/javascript");
}

export function componentJsCacheKey(pathname: string, rollout: ResponsiveSourceImageRollout): string {
    const variant = `responsive-source-images:public-${rollout.public ? "on" : "off"}:private-${
        rollout.private ? "on" : "off"
    }`;
    return P9R_CACHE.js(`${pathname}:${variant}`);
}
