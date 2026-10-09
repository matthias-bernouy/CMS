import type DeliveryCms from "cms-delivery/DeliveryCms";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { generateBlocEntry } from "@bernouy/cms-content/rendering";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import { resolveCollectionAssetExpressions } from "cms-delivery/core/assets/collectionAssets";

export default async function BlocServer(req: Request, delivery: DeliveryCms) {
    const url = new URL(req.url);
    const tag = url.searchParams.get("tag");

    if (!tag) {
        return Response.error();
    }
    const collectionRevision = (await delivery.repository.getContentRevision?.()) ?? 0;

    return cachedResponseAsync(
        req,
        `${CMS_CACHE_KEYS.bloc(tag)}:collections:${collectionRevision}`,
        delivery.cache,
        () =>
            generateBlocEntry(tag, {
                getBlocViewJS: async (id) => {
                    const source = await delivery.repository.getBlocViewJS(id);
                    return source ? resolveCollectionAssetExpressions(source, delivery) : null;
                },
            }),
        publicAssetCacheControl(req),
    ).catch(() => Response.error());
}
