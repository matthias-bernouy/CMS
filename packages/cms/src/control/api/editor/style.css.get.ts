import type { ControlCms } from "src/control/ControlCms";
import { cachedResponseAsync, compress } from "src/socle/server/compression";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";

export default async function editorStyleGet(req: Request, cms: ControlCms) {
    return cachedResponseAsync(req, P9R_CACHE.STYLE, cms.cache, async () => {
        const system = await cms.repository.getSystem();
        return compress(system.site?.theme ?? "", "text/css");
    });
}
