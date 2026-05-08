import type { ControlCms } from "src/control/ControlCms";
import { getResolverFor } from "src/control/core/data/getResolverFor";

/**
 * Flat list of field paths into the response schema. Hot path for the
 * richtextbar autocomplete: tiny payload (just strings), no nested
 * structures to walk client-side.
 *
 * Input is a fully-qualified endpoint URL (the value emitted by
 * `<cms-schema-picker>`). The provider is resolved by longest-prefix
 * match against every registered `server`; the remaining suffix is the
 * OpenAPI path used to look up the operation. `method` defaults to GET
 * — most consumer blocs are GET-only and don't bother to pass it.
 */
export default async function getProviderFields(req: Request, cms: ControlCms) {
    const u      = new URL(req.url);
    const target = u.searchParams.get("url");
    const method = (u.searchParams.get("method") ?? "GET").toUpperCase();
    if (!target) return new Response("Missing url", { status: 400 });

    const providers = await cms.repository.getDataProviders();
    let provider: typeof providers[number] | null = null;
    let bestLen = -1;
    for (const p of providers) {
        const server = (p.server ?? "").replace(/\/+$/, "");
        if (!server) continue;
        if (target === server || target.startsWith(server + "/")) {
            if (server.length > bestLen) { provider = p; bestLen = server.length; }
        }
    }
    if (!provider) return new Response("No provider matches this URL", { status: 404 });

    const path = target.slice(bestLen) || "/";

    const resolver = await getResolverFor(cms, provider.id);
    if (!resolver) return new Response("Not synced", { status: 404 });

    return new Response(JSON.stringify(resolver.getResponseFields(`${method} ${path}`)), {
        headers: { "Content-Type": "application/json" },
    });
}
