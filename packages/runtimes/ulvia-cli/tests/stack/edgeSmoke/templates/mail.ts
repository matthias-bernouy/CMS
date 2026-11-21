import { expect } from "bun:test";
import { repositoryApi } from "../../../../../../../tests/integration/instance/repository/client";
import { recoveryToken, capturedMessage } from "../../../../../../../tests/performance/scenarios/email/smtp/message";
import type { HostedSite } from "../setup";
import { smokeSmtp } from "./smtp";

export async function verifyAccountEmailDelivery(
    primary: HostedSite,
    environment: Record<string, string | undefined>,
    administrator: { cookie: string },
) {
    const api = repositoryApi(primary.origin);
    const sink = await smokeSmtp(environment);
    const email = `templates-${crypto.randomUUID()}@performance.test`;
    const password = `Original-${crypto.randomUUID()}!`;
    const replacement = `Replacement-${crypto.randomUUID()}!`;
    const configure = async (enabled: boolean) => {
        const response = await api.request(
            "ulvia/cms.emailer.smtp",
            "/configuration",
            "POST",
            {
                enabled,
                fromEmail: "sender@performance.test",
                fromName: "Template journey",
                replyTo: "reply@performance.test",
                smtp: sink.connection,
            },
            administrator,
        );
        expect(response.status).toBe(200);
        await response.body?.cancel();
    };
    const publicCall = async (path: string, input: unknown) => {
        const response = await api.request("ulvia/cms.access", path, "POST", input);
        expect(response.status, `${path}: ${response.status}`).toBe(200);
        return response.json();
    };
    try {
        await configure(true);
        expect(await publicCall("/signup", { email, password })).toEqual({ accepted: true });
        const verification = await sink.control.mailbox(email);
        expect(verification.messages).toHaveLength(1);
        expect(capturedMessage(verification.messages[0]!.raw).headers.subject).toBe(
            "Custom verification for Ulvia CMS",
        );
        const verifyToken = recoveryToken(verification.messages[0]!.raw, primary.origin, "/confirm-email");
        expect(await publicCall("/confirm-email-verification", { token: verifyToken })).toEqual({ confirmed: true });
        await api.session(email, password);
        await publicCall("/request-password-reset", { email });
        const reset = await sink.control.mailbox(email);
        expect(reset.messages).toHaveLength(2);
        expect(capturedMessage(reset.messages[1]!.raw).headers.subject).toBe("Reset your password for Ulvia CMS");
        const resetToken = recoveryToken(reset.messages[1]!.raw, primary.origin, "/reset-password");
        expect(await publicCall("/confirm-password-reset", { token: resetToken, password: replacement })).toEqual({
            confirmed: true,
        });
        await api.session(email, replacement);
    } finally {
        try {
            await configure(false);
        } finally {
            await sink.close();
        }
    }
}
