import type { ControlCms } from "cms-control/ControlCms";
import { updateFileContent, MAX_UPLOAD_BYTES } from "@bernouy/cms-content/files";
import { invalidatePagesReferencingFile } from "cms-control/core/admin/server/cache/invalidation";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { readBoundedFormData } from "@bernouy/http-runner";

const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

/** Hard cap on a single uploaded file, enforced server-side (mirrors upload). */

/**
 * PUT /api/files/content (multipart: `file` + `id`) — replace an existing file's
 * bytes IN PLACE, keeping its id/name/location. Refreshes the content hash and
 * invalidates the cached pages that reference the file so they re-render with the
 * new `?v=` token. 404 when the id is unknown or not a file.
 */
export default async function updateFileContentEndpoint(req: Request, cms: ControlCms) {
    const form = await readBoundedFormData(req, MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES);
    const file = form.get("file");
    if (!(file instanceof File)) {
        throw new InvalidParam("file", "multipart `file` expected.");
    }
    const idRaw = form.get("id");
    const id = typeof idRaw === "string" && idRaw ? idRaw : null;
    if (!id) {
        throw new InvalidParam("id", "`id` of the file to update is required.");
    }

    const item = await updateFileContent(cms.filesMetadata, cms.filesBlob, id, file, cms.fileMutations);
    if (!item) {
        return new Response("Not found", { status: 404 });
    }

    await invalidatePagesReferencingFile(cms, id);
    return Response.json(item);
}
