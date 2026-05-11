import type { ControlCms } from 'src/control/ControlCms';
import { readJsonBody } from 'src/control/core/http/readJsonBody';
import { parseSupabaseDto } from 'src/control/core/validation/dataProvider/parseSupabaseDto';
import { createSupabaseProvider } from 'src/control/core/dataProvider/official/supabase/createSupabaseProvider';

export default async function postSupabaseProvider(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseSupabaseDto(body);
    await createSupabaseProvider(cms, dto);
    return new Response();
}
