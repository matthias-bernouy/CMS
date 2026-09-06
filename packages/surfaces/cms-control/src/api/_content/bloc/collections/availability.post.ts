import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { saveCollectionAvailability } from "cms-control/core/content/blocLibrary/availability";

export default async function postCollectionAvailability(req: Request, cms: ControlCms): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id")?.trim();
    if (!id) {
        throw new MissingParam("id");
    }
    return Response.json(await saveCollectionAvailability(cms, id, await readJsonBody(req)));
}
