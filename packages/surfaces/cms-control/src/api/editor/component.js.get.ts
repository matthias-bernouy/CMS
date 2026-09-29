import { join } from "node:path";
import type { ControlCms } from "cms-control/ControlCms";
import { cachedResponseAsync, compress } from "@bernouy/http-runner";

const SOURCE = join(import.meta.dir, "component.client.ts");

export default async function editorComponentGet(req: Request, cms: ControlCms): Promise<Response> {
    const cacheKey = "js:editor-component-runtime:gateway-images";
    return cachedResponseAsync(
        req,
        cacheKey,
        cms.cache,
        async () => {
            const result = await Bun.build({
                entrypoints: [SOURCE],
                format: "iife",
            });
            return compress(await result.outputs[0]!.text(), "text/javascript");
        },
        "no-cache, must-revalidate",
    );
}
