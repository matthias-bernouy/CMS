import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { validateFolderName } from "@bernouy/cms-files";

/** POST /api/files/folder { name, parentId? } — create a folder. */
export default async function createFolder(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const name = validateFolderName(body.name);
    const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    const folder = await cms.filesMetadata.createFolder({ name, parentId });
    return Response.json(folder, { status: 201 });
}
