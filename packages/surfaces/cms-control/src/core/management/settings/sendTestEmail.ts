import type { ControlCms } from "cms-control/ControlCms";
import type { EmailTestDto } from "cms-control/core/validation/settings/parseEmailTestDto";

export async function sendTestEmail(cms: ControlCms, dto: EmailTestDto): Promise<void> {
    if (!cms.publicAuth.emailTest) {
        throw new Error("Public auth email test action is not configured");
    }
    await cms.publicAuth.emailTest.send(dto);
}
