import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { sendTestEmail } from "cms-control/core/settings/sendTestEmail";
import { parseEmailTestDto } from "cms-control/core/validation/settings/parseEmailTestDto";

export default async function postEmailTest(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto = parseEmailTestDto(body);
    await sendTestEmail(cms, dto);
    return new Response();
}
