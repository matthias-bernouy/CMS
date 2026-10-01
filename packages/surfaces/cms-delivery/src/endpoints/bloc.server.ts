import type DeliveryCms from "cms-delivery/DeliveryCms";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { generateBlocEntry } from "@bernouy/cms-content/rendering";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";

export default async function BlocServer(req: Request, delivery: DeliveryCms) {
    const url = new URL(req.url);
    const tag = url.searchParams.get("tag");

    if (!tag) {
        return Response.error();
    }

    return cachedResponseAsync(
        req,
        CMS_CACHE_KEYS.bloc(tag),
        delivery.cache,
        () => generateBlocEntry(tag, delivery.repository),
        publicAssetCacheControl(req),
    ).catch(() => Response.error());
}
