import type { ControlCms } from 'src/control/ControlCms';
import { readJsonBody } from 'src/control/core/http/readJsonBody';
import { parseDataProviderCreateDto } from 'src/control/core/validation/dataProvider/parseCreateDto';
import { createDataProvider } from 'src/control/core/dataProvider/createDataProvider';

export default async function postDataProvider(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseDataProviderCreateDto(body);
    await createDataProvider(cms, dto);
    return new Response();
}
