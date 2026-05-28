import type { ControlCms } from 'src/control/ControlCms';
import { readJsonBody } from 'src/control/core/http/readJsonBody';
import { parseTemplateUpdateDto } from 'src/control/core/validation/template/parseUpdateDto';
import { updateTemplate } from 'src/control/core/template/updateTemplate';

export default async function putTemplate(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseTemplateUpdateDto(body);
    await updateTemplate(cms, dto);
    return new Response();
}
