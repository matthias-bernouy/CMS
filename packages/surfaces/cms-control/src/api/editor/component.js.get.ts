import { join } from "node:path";
import type { ControlCms } from "cms-control/ControlCms";
import { cachedResponseAsync, compress } from "@bernouy/http-runner";

const SOURCE = join(import.meta.dir, "component.client.ts");

export default async function editorComponentGet(req: Request, cms: ControlCms): Promise<Response> {
    const interceptorReady = Boolean(cms.config.sourceImageInterceptor);
    const publicEnabled = interceptorReady && Boolean(cms.config.responsivePublicSourceImagesEnabled);
    const privateEnabled = interceptorReady && Boolean(cms.config.responsivePrivateSourceImagesEnabled);
    const cacheKey = `js:editor-component-runtime:responsive-source-images:public-${
        publicEnabled ? "on" : "off"
    }:private-${privateEnabled ? "on" : "off"}`;
    return cachedResponseAsync(
        req,
        cacheKey,
        cms.cache,
        async () => {
            const result = await Bun.build({
                entrypoints: [SOURCE],
                format: "iife",
                define: {
                    __CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED__: String(publicEnabled),
                    __CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED__: String(privateEnabled),
                },
            });
            return compress(await result.outputs[0]!.text(), "text/javascript");
        },
        "no-cache, must-revalidate",
    );
}
