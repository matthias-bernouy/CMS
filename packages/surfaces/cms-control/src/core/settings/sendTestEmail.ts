import type { ControlCms } from "cms-control/ControlCms";
import type { EmailTestDto } from "cms-control/core/validation/settings/parseEmailTestDto";

export async function sendTestEmail(cms: ControlCms, dto: EmailTestDto): Promise<void> {
    await cms.publicAuth.emailer.send({
        to:      { email: dto.to },
        subject: "CMS email test",
        text:    "This is a test email from your CMS email settings.",
        html:    "<p>This is a test email from your CMS email settings.</p>",
    });
}
