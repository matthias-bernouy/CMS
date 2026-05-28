import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

/** POST /api/files/folder { name, parentId? } — create a folder. */
export default async function createFolder(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    if (typeof body.name !== "string" || !body.name.trim()) throw new InvalidParam("name");
    const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    const folder = await cms.filesMetadata.createFolder({ name: body.name, parentId });
    return Response.json(folder, { status: 201 });
}
