import type { ControlCms } from "cms-control/ControlCms";
import type { ItemPatch } from "@bernouy/cms-files";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import MissingParam from "cms-control/errors/Http/MissingParam";

/** PATCH /api/files?id= { name?, parentId? } — rename and/or move an item. */
export default async function updateFile(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    const body = await readJsonBody(req);

    const patch: ItemPatch = {};
    if (typeof body.name === "string") {
        patch.name = body.name;
    }
    if (body.parentId === null || typeof body.parentId === "string") {
        patch.parentId = body.parentId as string | null;
    }

    const item = await cms.filesMetadata.updateItem(id, patch);
    if (!item) {
        return new Response("Not found", { status: 404 });
    }
    return Response.json(item);
}
