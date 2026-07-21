import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { parsePageCreateDto } from "cms-control/core/validation/page/parseCreateDto";
import { createPage } from "cms-control/core/page/createPage";

export default async function postPage(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto = parsePageCreateDto(body);
    await createPage(cms, dto);
    return new Response();
}
