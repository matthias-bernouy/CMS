import type { ControlCms } from 'src/control/ControlCms';
import { readJsonBody } from 'src/control/core/http/readJsonBody';
import { parseSupabaseDataDto } from 'src/control/core/validation/dataProvider/parseSupabaseDataDto';
import { createSupabaseDataProvider } from 'src/control/core/dataProvider/official/supabaseData/createSupabaseDataProvider';

export default async function postSupabaseDataProvider(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseSupabaseDataDto(body);
    await createSupabaseDataProvider(cms, dto);
    return new Response();
}
