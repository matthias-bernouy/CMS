import type DeliveryCms from "src/delivery/DeliveryCms";
import { cachedResponseAsync, publicAssetCacheControl } from "src/socle/server/compression";
import { generateBlocEntry } from "src/delivery/core/blocs/buildBloc";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";

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
