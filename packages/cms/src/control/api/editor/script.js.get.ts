import type { ControlCms } from "src/control/ControlCms";
import { cachedResponseAsync, compress } from "src/socle/server/compression";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";

export default async function editorScriptGet(req: Request, cms: ControlCms) {
    return cachedResponseAsync(req, P9R_CACHE.EDITOR_SCRIPT, cms.cache, async () => {
        const blocs = await cms.repository.getBlocsJS();

        const js = blocs.map(b => [
            `try { ${b.editorJS} } catch(e) { console.error("[editor] bloc ${b.id} editorJS:", e); }`,
            `try { ${b.viewJS}   } catch(e) { console.error("[editor] bloc ${b.id} viewJS:", e); }`,
        ].join("\n")).join("\n");

        return compress(js, "text/javascript");
    });
}
