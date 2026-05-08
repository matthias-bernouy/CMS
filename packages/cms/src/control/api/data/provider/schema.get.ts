import type { ControlCms } from "src/control/ControlCms";
import { getResolverFor } from "src/control/core/data/getResolverFor";

/**
 * Response schema (`$ref`-resolved) for a specific endpoint. Default
 * status `200`; falls back to `default` and any 2xx if absent. Used by
 * the picker's preview pane and the richtextbar (with `/fields`).
 */
export default async function getProviderSchema(req: Request, cms: ControlCms) {
    const url      = new URL(req.url);
    const id       = url.searchParams.get("id");
    const endpoint = url.searchParams.get("endpoint");
    const status   = url.searchParams.get("status") ?? undefined;
    if (!id)       return new Response("Missing id",       { status: 400 });
    if (!endpoint) return new Response("Missing endpoint", { status: 400 });

    const resolver = await getResolverFor(cms, id);
    if (!resolver) return new Response("Not found or not synced", { status: 404 });

    const schema = resolver.getResponseSchema(endpoint, status);
    if (!schema) return new Response("Schema not found", { status: 404 });

    return new Response(JSON.stringify(schema), {
        headers: { "Content-Type": "application/json" },
    });
}
