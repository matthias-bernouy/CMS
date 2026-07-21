import type { ControlCms } from "cms-control/ControlCms";
import { getPagesList, type PageListOptions } from "cms-control/core/page/getPagesList";

/** GET /api/page/list?search=&tag=&visible=&sortBy=&sortOrder= — the admin
 *  Pages table, server-filtered + sorted. All params are optional; unknown
 *  values are ignored (falls back to the default: all pages, title asc). */
export default async function getPages(req: Request, cms: ControlCms) {
    const q = new URL(req.url).searchParams;
    const opts: PageListOptions = {};

    const search = q.get("search");
    if (search) {
        opts.search = search;
    }

    const tag = q.get("tag");
    if (tag) {
        opts.tag = tag;
    }

    const visible = q.get("visible");
    if (visible === "published" || visible === "draft") {
        opts.visible = visible;
    }

    const sortBy = q.get("sortBy");
    if (sortBy === "title" || sortBy === "path" || sortBy === "visible") {
        opts.sortBy = sortBy;
    }

    const sortOrder = q.get("sortOrder");
    if (sortOrder === "asc" || sortOrder === "desc") {
        opts.sortOrder = sortOrder;
    }

    const pages = await getPagesList(cms, opts);
    return new Response(JSON.stringify(pages), {
        headers: { "Content-Type": "application/json" },
    });
}
