import type { ControlCms } from "src/control/ControlCms";
import { getResolverFor } from "src/control/core/data/getResolverFor";

export default async function getProviderTags(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id  = url.searchParams.get("id");
    if (!id) return new Response("Missing id", { status: 400 });

    const resolver = await getResolverFor(cms, id);
    if (!resolver) return new Response("Not found or not synced", { status: 404 });

    return new Response(JSON.stringify(resolver.listTags()), {
        headers: { "Content-Type": "application/json" },
    });
}
