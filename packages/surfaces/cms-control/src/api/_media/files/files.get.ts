import type { ControlCms } from "cms-control/ControlCms";
import type { FilesItemType, FilesListOptions } from "@bernouy/cms-files";

/** GET /api/files?parentId=&accept=&search=&sortBy=&sortOrder=&page=&limit=
 *  List the direct children of a folder (no `parentId` = root). */
export default async function listFiles(req: Request, cms: ControlCms) {
    const q = new URL(req.url).searchParams;
    const parentRaw = q.get("parentId");
    const parentId = parentRaw && parentRaw !== "null" ? parentRaw : null;

    const opts: FilesListOptions = {};
    const accept = q.get("accept");
    if (accept) {
        opts.accept = accept.split(",").filter(Boolean) as FilesItemType[];
    }
    const search = q.get("search");
    if (search) {
        opts.search = search;
    }
    const sortBy = q.get("sortBy");
    if (sortBy) {
        opts.sortBy = sortBy as FilesListOptions["sortBy"];
    }
    const sortOrder = q.get("sortOrder");
    if (sortOrder === "asc" || sortOrder === "desc") {
        opts.sortOrder = sortOrder;
    }
    const page = q.get("page");
    const limit = q.get("limit");
    if (page && limit) {
        opts.pagination = { page: Number(page), limit: Number(limit) };
    }

    // The admin addresses bytes by opaque id (`cmsFilesIdUrl(item.id)`), so the
    // listing no longer carries a readable per-file path — no id→path round-trip.
    const listing = await cms.filesMetadata.listChildren(parentId, opts);
    return Response.json(listing);
}
