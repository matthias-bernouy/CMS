import type { ControlCms } from 'src/control/ControlCms';
import { readJsonBody } from 'src/control/core/http/readJsonBody';
import { parseDataProviderTestDto } from 'src/control/core/validation/dataProvider/parseTestDto';
import { testConnection } from 'src/control/core/dataProvider/testConnection';

export default async function postDataProviderTest(req: Request, _cms: ControlCms) {
    const body   = await readJsonBody(req);
    const dto    = parseDataProviderTestDto(body);
    const result = await testConnection(dto);
    return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
    });
}
