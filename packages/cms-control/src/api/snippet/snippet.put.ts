import type { ControlCms } from 'src/control/ControlCms';
import { readJsonBody } from 'src/control/core/http/readJsonBody';
import { parseSnippetUpdateDto } from 'src/control/core/validation/snippet/parseUpdateDto';
import { updateSnippet } from 'src/control/core/snippet/updateSnippet';

export default async function putSnippet(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseSnippetUpdateDto(body);
    await updateSnippet(cms, dto);
    return new Response();
}
