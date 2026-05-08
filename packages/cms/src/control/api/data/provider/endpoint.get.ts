import type { ControlCms } from "src/control/ControlCms";
import { getResolverFor } from "src/control/core/data/getResolverFor";
import { methodColor } from "src/control/core/data/methodColor";

/**
 * Endpoint detail. Accepts either:
 *   - `endpoint=METHOD path` (legacy combined form, used by the picker), or
 *   - `method=…&path=…` (split form, used by the admin detail page so
 *     links don't need to URL-encode the space).
 */
export default async function getProviderEndpoint(req: Request, cms: ControlCms) {
    const url      = new URL(req.url);
    const id       = url.searchParams.get("id");
    const endpoint = url.searchParams.get("endpoint");
    const method   = url.searchParams.get("method");
    const path     = url.searchParams.get("path");
    if (!id) return new Response("Missing id", { status: 400 });

    const endpointId = endpoint ?? (method && path ? `${method.toUpperCase()} ${path}` : null);
    if (!endpointId) return new Response("Missing endpoint", { status: 400 });

    const resolver = await getResolverFor(cms, id);
    if (!resolver) return new Response("Not found or not synced", { status: 404 });

    const result = resolver.getEndpoint(endpointId);
    if (!result) return new Response("Endpoint not found", { status: 404 });

    const mockupsRaw = await cms.repository.listMockups(id);
    const responses  = resolver.listResponses(endpointId);
    const mockups    = mockupsRaw
        .filter(m => m.method === result.method && m.path === result.path)
        .map(m => {
            const matchedSchema = responses.find(r => r.status === String(m.status))?.schema ?? null;
            return {
                ...m,
                activeLabel: m.active ? "● active" : "",
                // JSON-stringified so the cms-fetch templating can drop it
                // straight into a `<cms-json-editor schema="...">` attribute.
                bodySchema:  matchedSchema ? JSON.stringify(matchedSchema) : "",
            };
        });

    const enriched = {
        ...result,
        methodColor:        methodColor(result.method),
        responses,
        mockups,
        mockupsEmptyLabel:  mockups.length === 0 ? "No mockups for this operation yet." : "",
    };
    return new Response(JSON.stringify(enriched), {
        headers: { "Content-Type": "application/json" },
    });
}
