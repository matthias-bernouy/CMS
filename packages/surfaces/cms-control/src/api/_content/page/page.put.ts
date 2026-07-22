import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { parsePageUpdateDto } from "cms-control/core/validation/page/parseUpdateDto";
import { updatePage } from "cms-control/core/content/page/updatePage";

export default async function putPage(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto = parsePageUpdateDto(body);
    await updatePage(cms, dto);
    return new Response();
}
