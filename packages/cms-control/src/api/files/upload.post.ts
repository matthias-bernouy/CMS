import type { ControlCms } from "cms-control/ControlCms";
import { uploadFile } from "cms-control/core/files/uploadFile";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

/** POST /api/files/upload (multipart: `file` + optional `parentId`) — store a
 *  file's bytes and create its metadata record. */
export default async function uploadFileEndpoint(req: Request, cms: ControlCms) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new InvalidParam("file", "multipart `file` expected.");
    const parentRaw = form.get("parentId");
    const parentId = typeof parentRaw === "string" && parentRaw && parentRaw !== "null" ? parentRaw : null;
    const item = await uploadFile(cms.filesMetadata, cms.filesBlob, file, parentId);
    return Response.json(item, { status: 201 });
}
