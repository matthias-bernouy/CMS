import type { ControlCms } from "src/control/ControlCms";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";

export default async function deleteSnippet(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const force = url.searchParams.get("force") === "true";

    if (!id) return new Response("Missing id", { status: 400 });

    const snippet = await cms.repository.getSnippetById(id);
    if (!snippet) return new Response("Not found", { status: 404 });

    const usages = await cms.repository.findPagesUsingSnippet(snippet.identifier);

    if (!force && usages.length > 0) {
        return new Response(JSON.stringify({
            error: "Snippet is in use",
            pages: usages.map(p => ({ path: p.path, title: p.title }))
        }), {
            status: 409,
            headers: { "Content-Type": "application/json" }
        });
    }

    await cms.repository.deleteSnippet(id);

    // Invalidate rendered-page cache for every page that referenced this snippet
    for (const page of usages) {
        cms.cache.delete(P9R_CACHE.page(page.path));
    }

    return new Response("Deleted", { status: 200 });
}
