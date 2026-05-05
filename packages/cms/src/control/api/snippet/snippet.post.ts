import type { ControlCms } from 'src/control/ControlCms';
import { readJsonBody } from 'src/control/core/http/readJsonBody';
import { parseSnippetCreateDto } from 'src/control/core/validation/snippet/parseCreateDto';
import { createSnippet } from 'src/control/core/snippet/createSnippet';

export default async function postSnippet(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseSnippetCreateDto(body);
    await createSnippet(cms, dto);
    return new Response();
}
