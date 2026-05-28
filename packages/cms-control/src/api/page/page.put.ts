import type { ControlCms } from 'src/control/ControlCms';
import { readJsonBody } from 'src/control/core/http/readJsonBody';
import { parsePageUpdateDto } from 'src/control/core/validation/page/parseUpdateDto';
import { updatePage } from 'src/control/core/page/updatePage';

export default async function putPage(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parsePageUpdateDto(body);
    await updatePage(cms, dto);
    return new Response();
}
