import type { ControlCms } from "src/control/ControlCms";
import MissingParam from "src/control/errors/Http/MissingParam";

/** GET /api/files/raw?id= — stream a file's bytes (the proxy read). */
export default async function rawFile(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new MissingParam("id");

    const item = await cms.filesMetadata.getItem(id);
    if (!item || item.type !== "file") return new Response("Not found", { status: 404 });

    const stream = await cms.filesBlob.get(id);
    if (!stream) return new Response("Not found", { status: 404 });

    return new Response(stream, {
        headers: { "Content-Type": item.mimeType, "Content-Length": String(item.size) },
    });
}
