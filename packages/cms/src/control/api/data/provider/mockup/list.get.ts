import type { ControlCms } from "src/control/ControlCms";
import MissingParam from "src/control/errors/Http/MissingParam";

/**
 * List mockups registered against a provider. Optional `method` + `path`
 * filters narrow the result to a single (provider, method, path)
 * operation — used by the provider detail page to show only the mockups
 * relevant to the currently-selected endpoint.
 */
export default async function getProviderMockups(req: Request, cms: ControlCms) {
    const url    = new URL(req.url);
    const id     = url.searchParams.get("id");
    const method = url.searchParams.get("method");
    const path   = url.searchParams.get("path");
    if (!id) throw new MissingParam("id");

    let mockups = await cms.repository.listMockups(id);
    if (method) mockups = mockups.filter(m => m.method === method.toUpperCase());
    if (path)   mockups = mockups.filter(m => m.path === path);

    // Pre-compute display fields so the cms-fetch template (which has no
    // conditional rendering) can stamp them as plain values.
    const out = mockups.map(m => ({
        ...m,
        activeLabel: m.active ? "● active" : "",
    }));

    return new Response(JSON.stringify(out), {
        headers: { "Content-Type": "application/json" },
    });
}
