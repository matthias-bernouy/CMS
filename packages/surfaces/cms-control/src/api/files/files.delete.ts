import type { ControlCms } from "cms-control/ControlCms";
import { deleteFileTree } from "@bernouy/cms-files";
import MissingParam from "cms-control/errors/Http/MissingParam";

/** DELETE /api/files?id=&recursive= — delete an item (folder needs `recursive=true`)
 *  and purge the removed files' bytes. */
export default async function deleteFile(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) throw new MissingParam("id");
    const recursive = url.searchParams.get("recursive") === "true";
    await deleteFileTree(cms.filesMetadata, cms.filesBlob, id, recursive);
    return new Response(null, { status: 204 });
}
