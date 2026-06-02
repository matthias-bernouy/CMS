import type { ControlCms } from "cms-control/ControlCms";
import type { FilesItemType, FilesListOptions } from "@bernouy/cms-shared";
import { pathOf } from "@bernouy/cms-shared";

/** GET /api/files?parentId=&accept=&search=&sortBy=&sortOrder=&page=&limit=
 *  List the direct children of a folder (no `parentId` = root). */
export default async function listFiles(req: Request, cms: ControlCms) {
    const q = new URL(req.url).searchParams;
    const parentRaw = q.get("parentId");
    const parentId = parentRaw && parentRaw !== "null" ? parentRaw : null;

    const opts: FilesListOptions = {};
    const accept = q.get("accept");
    if (accept) opts.accept = accept.split(",").filter(Boolean) as FilesItemType[];
    const search = q.get("search");
    if (search) opts.search = search;
    const sortBy = q.get("sortBy");
    if (sortBy) opts.sortBy = sortBy as FilesListOptions["sortBy"];
    const sortOrder = q.get("sortOrder");
    if (sortOrder === "asc" || sortOrder === "desc") opts.sortOrder = sortOrder;
    const page = q.get("page");
    const limit = q.get("limit");
    if (page && limit) opts.pagination = { page: Number(page), limit: Number(limit) };

    const listing = await cms.filesMetadata.listChildren(parentId, opts);

    // Attach each file's readable tree-path so the admin builds `.cms/files/<path>`
    // URLs without an id→path round-trip. The parent path is the same for every
    // child, so resolve it once and append the name.
    const parentPath = parentId && listing.items.some((it) => it.type === "file")
        ? (await pathOf(cms.filesMetadata, parentId)) ?? ""
        : "";
    const items = listing.items.map((it) =>
        it.type === "file"
            ? { ...it, path: parentPath ? `${parentPath}/${it.name}` : it.name }
            : it,
    );

    return Response.json({ ...listing, items });
}
