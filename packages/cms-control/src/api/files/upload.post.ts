import type { ControlCms } from "cms-control/ControlCms";
import { uploadFile } from "cms-control/core/files/uploadFile";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

/** Hard cap on a single uploaded file, enforced server-side. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

/** POST /api/files/upload (multipart: `file` + optional `parentId`) — store a
 *  file's bytes and create its metadata record. */
export default async function uploadFileEndpoint(req: Request, cms: ControlCms) {
    // Reject an oversized body via Content-Length BEFORE formData() buffers the
    // whole multipart envelope into memory. The post-parse file.size check below
    // stays as the authoritative guard on the actual file part (Content-Length
    // covers the whole envelope and a client can omit or understate it).
    const declaredLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
        throw new InvalidParam("file", `Body exceeds the ${MAX_UPLOAD_BYTES}-byte limit.`);
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new InvalidParam("file", "multipart `file` expected.");
    if (file.size > MAX_UPLOAD_BYTES) throw new InvalidParam("file", `File exceeds the ${MAX_UPLOAD_BYTES}-byte limit.`);
    const parentRaw = form.get("parentId");
    const parentId = typeof parentRaw === "string" && parentRaw && parentRaw !== "null" ? parentRaw : null;
    const item = await uploadFile(cms.filesMetadata, cms.filesBlob, file, parentId);
    return Response.json(item, { status: 201 });
}
