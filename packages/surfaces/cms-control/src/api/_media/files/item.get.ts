import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

/** GET /api/files/item?id= — one item (folder or file) by id. */
export default async function getFileItem(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    const item = await cms.filesMetadata.getItem(id);
    if (!item) {
        return new Response("Not found", { status: 404 });
    }
    return Response.json(item);
}
