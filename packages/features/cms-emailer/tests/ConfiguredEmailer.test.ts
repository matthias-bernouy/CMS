import { describe, expect, test } from "bun:test";
import { EmailConfigurationError } from "@bernouy/cms-emailer";
import { ConfiguredEmailer, type SmtpSendMailInput, type SmtpTransportConfig } from "@bernouy/cms-emailer/smtp";
import { InMemorySecretStore } from "@bernouy/secret-store";

describe("ConfiguredEmailer", () => {
    test("keeps SMTP credentials in the secret store and projects only their presence", async () => {
        const secrets = new InMemorySecretStore();
        const emailer = new ConfiguredEmailer({ secrets });

        expect(await emailer.getConfiguration()).toMatchObject({ enabled: false, transport: "smtp" });
        const configured = await emailer.updateConfiguration(enabledConfiguration("secret-value"));

        expect(configured.smtp.passwordConfigured).toBe(true);
        expect(JSON.stringify(configured)).not.toContain("secret-value");
        expect(await secrets.get("EMAILER_CONFIGURATION")).toContain("secret-value");
    });

    test("reuses an existing password when administrators update non-secret settings", async () => {
        const secrets = new InMemorySecretStore();
        const emailer = new ConfiguredEmailer({ secrets });
        await emailer.updateConfiguration(enabledConfiguration("secret-value"));

        await emailer.updateConfiguration({
            ...enabledConfiguration(),
            smtp: { ...enabledConfiguration().smtp, host: "smtp-b.example.com", password: undefined },
        });

        expect(await secrets.get("EMAILER_CONFIGURATION")).toContain('"password":"secret-value"');
        expect(await emailer.getConfiguration()).toMatchObject({ smtp: { host: "smtp-b.example.com" } });
    });

    test("sends through SMTP using the stored configuration", async () => {
        const transportConfigs: SmtpTransportConfig[] = [];
        const messages: SmtpSendMailInput[] = [];
        const emailer = new ConfiguredEmailer({
            secrets: new InMemorySecretStore(),
            transportFactory: async (config) => {
                transportConfigs.push(config);
                return { sendMail: async (input) => messages.push(input) };
            },
        });
        await emailer.updateConfiguration(enabledConfiguration("secret-value"));

        await emailer.send({
            to: { email: "ada@example.com", displayName: "Ada" },
            subject: "Hello",
            text: "Plain",
            html: "<p>Plain</p>",
        });

        expect(transportConfigs[0]).toEqual({
            host: "smtp.example.com",
            port: 587,
            secure: false,
            auth: { user: "postmaster@example.com", pass: "secret-value" },
        });
        expect(messages[0]).toMatchObject({
            from: '"CMS" <no-reply@example.com>',
            to: '"Ada" <ada@example.com>',
            replyTo: "support@example.com",
        });
    });

    test("rejects incomplete enabled configuration and disabled delivery", async () => {
        const emailer = new ConfiguredEmailer({ secrets: new InMemorySecretStore() });

        await expect(emailer.updateConfiguration(enabledConfiguration())).rejects.toBeInstanceOf(
            EmailConfigurationError,
        );
        await expect(
            emailer.send({ to: { email: "ada@example.com" }, subject: "Hello", text: "Plain" }),
        ).rejects.toMatchObject({ code: "disabled" });
    });
});

function enabledConfiguration(password?: string) {
    return {
        enabled: true,
        fromEmail: "no-reply@example.com",
        fromName: "CMS",
        replyTo: "support@example.com",
        transport: "smtp" as const,
        smtp: {
            host: "smtp.example.com",
            port: 587,
            secure: false,
            username: "postmaster@example.com",
            ...(password === undefined ? {} : { password }),
        },
    };
}
