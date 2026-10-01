import type { ControlCms } from "cms-control/ControlCms";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { invalidateAllPages } from "cms-control/core/admin/server/cache/invalidation";

/** Delete a page and retain its paths as redirects or 410 Gone tombstones. */
export default async function deletePage(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
        return new Response("Missing id", { status: 400 });
    }

    const page = await cms.repository.getPageById(id);
    if (!page) {
        return new Response("Not found", { status: 404 });
    }

    const alternativeId = url.searchParams.get("alternativeId");
    if (alternativeId) {
        const alternative = await cms.repository.getPageById(alternativeId);
        if (!alternative || !alternative.visible || alternative.id === id) {
            throw new InvalidParam("alternativeId", "Choose another published page.");
        }
    }
    if (cms.repository.deletePageWithAlternative) {
        await cms.repository.deletePageWithAlternative(id, alternativeId);
    } else {
        await cms.repository.deletePage(id);
    }
    cms.cache.delete(CMS_CACHE_KEYS.page(page.path));
    invalidateAllPages(cms);
    return new Response("Deleted", { status: 200 });
}
