import type { ControlCms } from "cms-control/ControlCms";
import { P9R_CACHE } from "@bernouy/cms-content";

/** DELETE /api/page?id= — remove a page. Pages aren't referenced by other
 *  content (templates/snippets are referenced BY pages, not the reverse), so
 *  no consumer conflict check is needed; the rendered-page cache is dropped. */
export default async function deletePage(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return new Response("Missing id", { status: 400 });

    const page = await cms.repository.getPageById(id);
    if (!page) return new Response("Not found", { status: 404 });

    await cms.repository.deletePage(id);
    cms.cache.delete(P9R_CACHE.page(page.path));
    return new Response("Deleted", { status: 200 });
}
