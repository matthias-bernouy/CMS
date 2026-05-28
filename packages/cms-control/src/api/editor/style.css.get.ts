import type { ControlCms } from "cms-control/ControlCms";
import { cachedResponseAsync, compress, publicAssetCacheControl } from "@bernouy/cms-shared";
import { P9R_CACHE } from "@bernouy/cms-shared";

export default async function editorStyleGet(req: Request, cms: ControlCms) {
    return cachedResponseAsync(req, P9R_CACHE.STYLE, cms.cache, async () => {
        const system = await cms.repository.getSystem();
        return compress(system.site?.theme ?? "", "text/css");
    }, publicAssetCacheControl(req));
}
