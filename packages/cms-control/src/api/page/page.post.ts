import type { ControlCms } from 'src/control/ControlCms';
import { readJsonBody } from 'src/control/core/http/readJsonBody';
import { parsePageCreateDto } from 'src/control/core/validation/page/parseCreateDto';
import { createPage } from 'src/control/core/page/createPage';

export default async function postPage(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parsePageCreateDto(body);
    await createPage(cms, dto);
    return new Response();
}
