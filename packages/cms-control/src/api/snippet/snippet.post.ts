import type { ControlCms } from 'cms-control/ControlCms';
import { readJsonBody } from 'cms-control/core/http/readJsonBody';
import { parseSnippetCreateDto } from 'cms-control/core/validation/snippet/parseCreateDto';
import { createSnippet } from 'cms-control/core/snippet/createSnippet';

export default async function postSnippet(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseSnippetCreateDto(body);
    await createSnippet(cms, dto);
    return new Response();
}
