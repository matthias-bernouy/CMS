import type { ControlCms } from 'cms-control/ControlCms';
import { readJsonBody } from 'cms-control/core/http/readJsonBody';
import { parseSnippetUpdateDto } from 'cms-control/core/validation/snippet/parseUpdateDto';
import { updateSnippet } from 'cms-control/core/snippet/updateSnippet';

export default async function putSnippet(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseSnippetUpdateDto(body);
    await updateSnippet(cms, dto);
    return new Response();
}
