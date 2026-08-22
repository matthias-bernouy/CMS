import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { updatePageConfig } from "cms-control/core/content/page/updatePageConfig";
import { parsePageConfigUpdateDto } from "cms-control/core/validation/page/parseConfigUpdateDto";

export default async function putConfigDetail(req: Request, cms: ControlCms): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }

    const body = await readJsonBody(req);
    const updatedId = await updatePageConfig(cms, parsePageConfigUpdateDto(id, body));
    return Response.json({ id: updatedId });
}
