import type { ControlCms } from "src/control/ControlCms";
import { getResolverFor } from "src/control/core/data/getResolverFor";
import type { SlimEndpoint } from "src/control/core/data/types";

type Hit = SlimEndpoint & { providerId: string };

/**
 * Cross-provider endpoint search. Loops through synced providers and
 * unions matching endpoints. Empty query returns an empty list (avoid
 * accidentally dumping every endpoint of every provider).
 */
export default async function searchEndpoints(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const q   = (url.searchParams.get("q") ?? "").trim();
    if (!q) return jsonResponse([]);

    const providers = await cms.repository.getDataProviders();
    const out: Hit[] = [];
    for (const p of providers) {
        if (!p.spec) continue;
        const resolver = await getResolverFor(cms, p.id);
        if (!resolver) continue;
        for (const ep of resolver.search(q)) {
            out.push({ providerId: p.id, ...ep });
        }
    }
    return jsonResponse(out);
}

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
    });
}
