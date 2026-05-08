import type { ControlCms } from "src/control/ControlCms";
import { getResolverFor } from "src/control/core/data/getResolverFor";
import { methodColor } from "src/control/core/data/methodColor";

export default async function getProviderEndpoints(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id  = url.searchParams.get("id");
    if (!id) return new Response("Missing id", { status: 400 });

    const resolver = await getResolverFor(cms, id);
    if (!resolver) return new Response("Not found or not synced", { status: 404 });

    const items = resolver.listEndpoints().map(ep => ({
        ...ep,
        providerId:  id,
        methodColor: methodColor(ep.method),
    }));
    return new Response(JSON.stringify(items), {
        headers: { "Content-Type": "application/json" },
    });
}
