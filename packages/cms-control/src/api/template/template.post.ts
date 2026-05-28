import type { ControlCms } from 'cms-control/ControlCms';
import { readJsonBody } from 'cms-control/core/http/readJsonBody';
import { parseTemplateCreateDto } from 'cms-control/core/validation/template/parseCreateDto';
import { createTemplate } from 'cms-control/core/template/createTemplate';

export default async function postTemplate(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseTemplateCreateDto(body);
    await createTemplate(cms, dto);
    return new Response();
}
