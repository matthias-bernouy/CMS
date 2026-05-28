import type { ControlCms } from 'cms-control/ControlCms';
import { readJsonBody } from 'cms-control/core/http/readJsonBody';
import { parseTemplateUpdateDto } from 'cms-control/core/validation/template/parseUpdateDto';
import { updateTemplate } from 'cms-control/core/template/updateTemplate';

export default async function putTemplate(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseTemplateUpdateDto(body);
    await updateTemplate(cms, dto);
    return new Response();
}
