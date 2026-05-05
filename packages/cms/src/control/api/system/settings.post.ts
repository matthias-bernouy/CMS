import type { ControlCms } from "src/control/ControlCms";
import { readJsonBody } from "src/control/core/http/readJsonBody";
import { parseSettingsUpdateDto } from "src/control/core/validation/settings/parseUpdateDto";
import { updateSettings } from "src/control/core/settings/updateSettings";

export default async function postSettings(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseSettingsUpdateDto(body);
    await updateSettings(cms, dto);
    return new Response();
}
