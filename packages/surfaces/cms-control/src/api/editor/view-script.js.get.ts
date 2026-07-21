import type { ControlCms } from "cms-control/ControlCms";
import { cachedResponseAsync, compress, publicAssetCacheControl } from "@bernouy/http-runner";
import { P9R_CACHE } from "@bernouy/cms-content";

export default async function editorViewScriptGet(req: Request, cms: ControlCms): Promise<Response> {
    return cachedResponseAsync(
        req,
        P9R_CACHE.EDITOR_VIEW_SCRIPT,
        cms.cache,
        async () => {
            const blocs = await cms.repository.getBlocsJS();
            const js = blocs
                .map((bloc) => {
                    const errorLabel = JSON.stringify(`[editor] bloc ${bloc.id} viewJS:`);
                    return `try {\n${bloc.viewJS}\n} catch (e) {\nconsole.error(${errorLabel}, e);\n}`;
                })
                .join("\n");

            return compress(js, "text/javascript");
        },
        publicAssetCacheControl(req),
    );
}
