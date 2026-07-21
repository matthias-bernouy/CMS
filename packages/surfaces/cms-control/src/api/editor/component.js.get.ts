import { join } from "node:path";
import type { ControlCms } from "cms-control/ControlCms";
import { cachedResponseAsync, compress, publicAssetCacheControl } from "@bernouy/http-runner";

const SOURCE = join(import.meta.dir, "component.client.ts");
const CACHE_KEY = "js:editor-component-runtime";

export default async function editorComponentGet(req: Request, cms: ControlCms): Promise<Response> {
    return cachedResponseAsync(
        req,
        CACHE_KEY,
        cms.cache,
        async () => {
            const result = await Bun.build({ entrypoints: [SOURCE], format: "iife" });
            return compress(await result.outputs[0]!.text(), "text/javascript");
        },
        publicAssetCacheControl(req),
    );
}
