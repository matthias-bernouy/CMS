import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { parseSettingsUpdateDto } from "cms-control/core/validation/settings/parseUpdateDto";
import { updateSettings } from "cms-control/core/settings/updateSettings";

export default async function postSettings(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto = parseSettingsUpdateDto(body);
    await updateSettings(cms, dto);
    return new Response();
}
