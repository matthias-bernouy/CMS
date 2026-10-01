import { join } from "node:path";
import type { ControlCms } from "cms-control/ControlCms";
import { cachedResponseAsync, compress, publicAssetCacheControl } from "@bernouy/http-runner";

const SOURCE = join(import.meta.dir, "bindingCore.client.ts");
const CACHE_KEY = "js:bloc-preview-binding-core";

export async function buildPreviewBindingCore(req: Request, cms: ControlCms): Promise<Response> {
    return cachedResponseAsync(
        req,
        CACHE_KEY,
        cms.cache,
        async () => {
            const result = await Bun.build({
                entrypoints: [SOURCE],
                format: "iife",
                target: "browser",
                conditions: ["bun"],
            });
            const output = result.outputs[0];
            if (!result.success || !output) {
                throw new Error(`Failed to build preview binding core runtime:\n${result.logs.join("\n")}`);
            }
            return compress(await output.text(), "text/javascript");
        },
        publicAssetCacheControl(req),
    );
}
