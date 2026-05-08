import type { ControlCms } from "src/control/ControlCms";
import { getResolverFor } from "src/control/core/data/getResolverFor";

export default async function getProviderEndpoint(req: Request, cms: ControlCms) {
    const url      = new URL(req.url);
    const id       = url.searchParams.get("id");
    const endpoint = url.searchParams.get("endpoint");
    if (!id)       return new Response("Missing id",       { status: 400 });
    if (!endpoint) return new Response("Missing endpoint", { status: 400 });

    const resolver = await getResolverFor(cms, id);
    if (!resolver) return new Response("Not found or not synced", { status: 404 });

    const result = resolver.getEndpoint(endpoint);
    if (!result) return new Response("Endpoint not found", { status: 404 });

    return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
    });
}
