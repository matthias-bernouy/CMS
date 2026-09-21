import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { updatePageSeo } from "cms-control/core/content/page/localization/updatePageSeo";

export default async function putPageSeo(req: Request, cms: ControlCms): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    return Response.json(await updatePageSeo(cms, id, await readJsonBody(req)));
}
