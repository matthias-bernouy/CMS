import type { ControlCms } from 'src/control/ControlCms';
import { readJsonBody } from 'src/control/core/http/readJsonBody';
import { parseTemplateCreateDto } from 'src/control/core/validation/template/parseCreateDto';
import { createTemplate } from 'src/control/core/template/createTemplate';

export default async function postTemplate(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseTemplateCreateDto(body);
    await createTemplate(cms, dto);
    return new Response();
}
