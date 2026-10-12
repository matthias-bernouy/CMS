import type KernelCms from "cms-kernel/KernelCms";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { generateBlocEntry } from "@bernouy/cms-content/rendering";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import { resolveCollectionAssetExpressions } from "cms-kernel/core/assets/collectionAssets";

export default async function BlocServer(req: Request, kernel: KernelCms) {
    const url = new URL(req.url);
    const tag = url.searchParams.get("tag");

    if (!tag) {
        return Response.error();
    }
    const collectionRevision = (await kernel.repository.getContentRevision?.()) ?? 0;

    return cachedResponseAsync(
        req,
        `${CMS_CACHE_KEYS.bloc(tag)}:collections:${collectionRevision}`,
        kernel.cache,
        () =>
            generateBlocEntry(tag, {
                getBlocViewJS: async (id) => {
                    const source = await kernel.repository.getBlocViewJS(id);
                    return source ? resolveCollectionAssetExpressions(source, kernel) : null;
                },
            }),
        publicAssetCacheControl(req),
    ).catch(() => Response.error());
}
