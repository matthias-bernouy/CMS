import type DeliveryCms from "cms-delivery/DeliveryCms";
import { cachedResponseAsync, publicAssetCacheControl } from "@bernouy/http-runner";
import { generateBlocEntry } from "cms-delivery/core/blocs/buildBloc";
import { P9R_CACHE } from "@bernouy/cms-content";

export default async function BlocServer(req: Request, delivery: DeliveryCms){

    const url = new URL(req.url);
    const tag = url.searchParams.get("tag");

    if (!tag) return Response.error();

    return cachedResponseAsync(
        req,
        P9R_CACHE.bloc(tag),
        delivery.cache,
        () => generateBlocEntry(tag, delivery.repository),
        publicAssetCacheControl(req),
    ).catch(() => Response.error());

}
