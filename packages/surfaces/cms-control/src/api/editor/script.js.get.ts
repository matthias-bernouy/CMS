import type { ControlCms } from "cms-control/ControlCms";
import { cachedResponseAsync, compress, publicAssetCacheControl } from "@bernouy/http-runner";
import { P9R_CACHE } from "@bernouy/cms-content";

export default async function editorScriptGet(req: Request, cms: ControlCms) {
    return cachedResponseAsync(req, P9R_CACHE.EDITOR_SCRIPT, cms.cache, async () => {
        const blocs = await cms.repository.getBlocsJS();

        const js = blocs.map(b => [
            `try { ${normalizeEditorScript(b.editorJS)} } catch(e) { console.error("[editor] bloc ${b.id} editorJS:", e); }`,
        ].join("\n")).join("\n");

        return compress(js, "text/javascript");
    }, publicAssetCacheControl(req));
}

function normalizeEditorScript(script: string): string {
    return script.replaceAll("BE5_DEFAULT_CONTENT_TO_BE_REPLACED", `""`);
}
