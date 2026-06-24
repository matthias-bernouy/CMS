import type { ControlCms } from "cms-control/ControlCms";
import type { EmailTestDto } from "cms-control/core/validation/settings/parseEmailTestDto";
import { DefaultAuthEmailComposer } from "@bernouy/cms-auth";

export async function sendTestEmail(cms: ControlCms, dto: EmailTestDto): Promise<void> {
    const publicAuth = cms.publicAuth;
    const composer = publicAuth.emailComposer ?? new DefaultAuthEmailComposer();
    const actionUrl = buildDemoActionUrl(
        dto.kind === "email_verification"
            ? publicAuth.emailVerificationUrl
            : publicAuth.passwordResetUrl,
    );
    await publicAuth.emailer.send(await composer.compose({
        kind:      dto.kind,
        to:        { email: dto.to, displayName: "Test Recipient" },
        actionUrl,
        token:     "test-token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        siteName:  publicAuth.siteName,
    }));
}

function buildDemoActionUrl(base: string): string {
    try {
        const url = new URL(base);
        url.searchParams.set("token", "test-token");
        return url.toString();
    } catch {
        return `${base}${base.includes("?") ? "&" : "?"}token=test-token`;
    }
}
