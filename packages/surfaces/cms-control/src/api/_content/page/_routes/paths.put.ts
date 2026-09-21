import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { updatePagePaths } from "cms-control/core/content/page/localization/updatePagePaths";

export default async function putPaths(req: Request, cms: ControlCms): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    const body = await readJsonBody(req);
    return Response.json(await updatePagePaths(cms, id, body));
}
