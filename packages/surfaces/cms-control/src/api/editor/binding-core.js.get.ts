import { join } from "node:path";
import type { ControlCms } from "cms-control/ControlCms";
import { cachedResponseAsync, compress, publicAssetCacheControl } from "@bernouy/http-runner";

const SOURCE = join(import.meta.dir, "binding-core.client.ts");
const CACHE_KEY = "js:editor-binding-core";

export default async function editorBindingCoreGet(req: Request, cms: ControlCms): Promise<Response> {
    return cachedResponseAsync(req, CACHE_KEY, cms.cache, async () => {
        const result = await Bun.build({ entrypoints: [SOURCE], format: "iife", conditions: ["bun"] });
        return compress(await result.outputs[0]!.text(), "text/javascript");
    }, publicAssetCacheControl(req));
}
