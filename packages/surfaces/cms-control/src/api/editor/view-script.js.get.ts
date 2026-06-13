import type { ControlCms } from "cms-control/ControlCms";
import { cachedResponseAsync, compress, publicAssetCacheControl } from "@bernouy/http-runner";

const EDITOR_VIEW_SCRIPT_CACHE_KEY = "js:editor-view-script";

export default async function editorViewScriptGet(req: Request, cms: ControlCms): Promise<Response> {
    return cachedResponseAsync(req, EDITOR_VIEW_SCRIPT_CACHE_KEY, cms.cache, async () => {
        const blocs = await cms.repository.getBlocsJS();
        const js = blocs
            .map(bloc =>
                `try { ${bloc.viewJS} } catch(e) { console.error("[editor] bloc ${bloc.id} viewJS:", e); }`,
            )
            .join("\n");

        return compress(js, "text/javascript");
    }, publicAssetCacheControl(req));
}
