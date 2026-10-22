import { expect, test } from "bun:test";
import { ConfiguredEmailer, type SmtpSendMailInput } from "@bernouy/cms-emailer/smtp";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { DefaultProviderCapabilityDispatcher, type ProviderCapabilityInvocationContext } from "@bernouy/ulvia-provider";
import { registerEmailerCapabilities } from "@bernouy/ulvia-provider/capabilities";

const context: ProviderCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "site-a",
    providerId: "ulvia.official",
};

test("Emailer capabilities configure secret-backed SMTP delivery without returning its password", async () => {
    const sent: SmtpSendMailInput[] = [];
    const emailer = new ConfiguredEmailer({
        secrets: new InMemorySecretStore(),
        transportFactory: async () => ({ sendMail: async (input) => sent.push(input) }),
    });
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerEmailerCapabilities(dispatcher, { emailer });

    const configuration = await invoke<Record<string, unknown>>(dispatcher, "emailer.configuration.update", {
        enabled: true,
        fromEmail: "no-reply@example.test",
        fromName: "Example",
        replyTo: "support@example.test",
        transport: "smtp",
        smtp: {
            host: "smtp.example.test",
            port: 587,
            secure: false,
            username: "postmaster@example.test",
            password: "secret-value",
        },
    });

    expect(configuration).toMatchObject({ smtp: { passwordConfigured: true } });
    expect(JSON.stringify(configuration)).not.toContain("secret-value");
    expect(await invoke<Record<string, unknown>>(dispatcher, "emailer.configuration.get", {})).toEqual(configuration);
    expect(
        await invoke<{ sent: boolean }>(dispatcher, "emailer.send", {
            toEmail: "member@example.test",
            subject: "Welcome",
            text: "Hello",
        }),
    ).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
});

function invoke<T = unknown>(
    dispatcher: DefaultProviderCapabilityDispatcher,
    capabilityId: string,
    input: Record<string, unknown>,
): Promise<T> {
    return dispatcher.invoke("ulvia.cms.emailer", capabilityId, input, context) as Promise<T>;
}
