import type { ControlCms } from 'src/control/ControlCms';
import { readJsonBody } from 'src/control/core/http/readJsonBody';
import { parseDataProviderUpdateDto } from 'src/control/core/validation/dataProvider/parseUpdateDto';
import { updateDataProvider } from 'src/control/core/dataProvider/updateDataProvider';

export default async function putDataProvider(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id  = url.searchParams.get('id');
    if (!id) return new Response('Missing id', { status: 400 });

    const body    = await readJsonBody(req);
    const dto     = parseDataProviderUpdateDto(body);
    const updated = await updateDataProvider(cms, id, dto);
    if (!updated) return new Response('Not found', { status: 404 });
    return new Response();
}
