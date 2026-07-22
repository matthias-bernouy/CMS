import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";

/** POST /api/files/folder { name, parentId? } — create a folder. The name rule
 *  (required, trimmed) is enforced by `ValidatingCmsFilesMetadata` (400). */
export default async function createFolder(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const name = typeof body.name === "string" ? body.name : "";
    const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    const folder = await cms.filesMetadata.createFolder({ name, parentId });
    return Response.json(folder, { status: 201 });
}
