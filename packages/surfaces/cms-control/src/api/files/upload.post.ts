import type { ControlCms } from "cms-control/ControlCms";
import { uploadFile, MAX_UPLOAD_BYTES } from "@bernouy/cms-files";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

/** POST /api/files/upload (multipart: `file` + optional `parentId` + optional
 *  `id`) — store a file's bytes and create its metadata record. The CLI push
 *  sends `id` (the dev registry uuid) so the remote `_id` matches dev; UI uploads
 *  omit it and a fresh id is minted. */
export default async function uploadFileEndpoint(req: Request, cms: ControlCms) {
    // Reject an oversized body via Content-Length BEFORE formData() buffers the
    // whole multipart envelope into memory — a perf guard. The authoritative
    // size rule lives in `uploadFile` (cms-files), enforced on the actual bytes.
    const declaredLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
        throw new InvalidParam("file", `Body exceeds the ${MAX_UPLOAD_BYTES}-byte limit.`);
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new InvalidParam("file", "multipart `file` expected.");
    const parentRaw = form.get("parentId");
    const parentId = typeof parentRaw === "string" && parentRaw && parentRaw !== "null" ? parentRaw : null;
    const idRaw = form.get("id");
    const id = typeof idRaw === "string" && idRaw ? idRaw : undefined;
    const item = await uploadFile(cms.filesMetadata, cms.filesBlob, file, parentId, id);
    return Response.json(item, { status: 201 });
}
