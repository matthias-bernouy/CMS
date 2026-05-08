import type { ControlCms } from "src/control/ControlCms";
import { getResolverFor } from "src/control/core/data/getResolverFor";

/**
 * Flat list of field paths into the response schema. Hot path for the
 * richtextbar autocomplete: tiny payload (just strings), no nested
 * structures to walk client-side.
 */
export default async function getProviderFields(req: Request, cms: ControlCms) {
    const url      = new URL(req.url);
    const id       = url.searchParams.get("id");
    const endpoint = url.searchParams.get("endpoint");
    if (!id)       return new Response("Missing id",       { status: 400 });
    if (!endpoint) return new Response("Missing endpoint", { status: 400 });

    const resolver = await getResolverFor(cms, id);
    if (!resolver) return new Response("Not found or not synced", { status: 404 });

    return new Response(JSON.stringify(resolver.getResponseFields(endpoint)), {
        headers: { "Content-Type": "application/json" },
    });
}
