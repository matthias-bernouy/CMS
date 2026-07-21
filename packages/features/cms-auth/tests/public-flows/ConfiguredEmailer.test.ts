import { describe, expect, test } from "bun:test";
import {
    ConfiguredEmailer,
    EmailConfigurationError,
    isEmailDeliveryDisabledError,
    type RuntimeEmailSettings,
    type SmtpSendMailInput,
    type SmtpTransportConfig,
} from "@bernouy/cms-auth";

describe("ConfiguredEmailer", () => {
    test("reads runtime settings, resolves the secret, and sends through SMTP", async () => {
        const transportConfigs: SmtpTransportConfig[] = [];
        const messages: SmtpSendMailInput[] = [];
        const emailer = new ConfiguredEmailer({
            readSettings: async () => enabledSettings(),
            secrets: { get: async (key) => (key === "SMTP_PASSWORD" ? "secret-value" : null) },
            transportFactory: async (config) => {
                transportConfigs.push(config);
                return { sendMail: async (input) => messages.push(input) };
            },
        });

        await emailer.send({
            to: { email: "ada@example.com", displayName: "Ada" },
            subject: "Hello",
            text: "Plain",
            html: "<p>Plain</p>",
        });

        expect(transportConfigs).toEqual([
            {
                host: "smtp.example.com",
                port: 587,
                secure: false,
                auth: { user: "postmaster@example.com", pass: "secret-value" },
            },
        ]);
        expect(messages).toEqual([
            {
                from: `"CMS" <no-reply@example.com>`,
                to: `"Ada" <ada@example.com>`,
                subject: "Hello",
                text: "Plain",
                html: "<p>Plain</p>",
                replyTo: "support@example.com",
            },
        ]);
    });

    test("re-reads settings for each send", async () => {
        let host = "smtp-a.example.com";
        const transportConfigs: SmtpTransportConfig[] = [];
        const emailer = new ConfiguredEmailer({
            readSettings: async () => enabledSettings({ host }),
            secrets: { get: async () => "secret-value" },
            transportFactory: async (config) => {
                transportConfigs.push(config);
                return { sendMail: async () => undefined };
            },
        });

        await emailer.send(message());
        host = "smtp-b.example.com";
        await emailer.send(message());

        expect(transportConfigs.map((c) => c.host)).toEqual(["smtp-a.example.com", "smtp-b.example.com"]);
    });

    test("fails when email delivery is disabled", async () => {
        const emailer = new ConfiguredEmailer({
            readSettings: async () => ({ ...enabledSettings(), enabled: false }),
            secrets: { get: async () => "secret-value" },
        });

        expect(await emailer.isEnabled()).toBe(false);
        const error = await emailer.send(message()).then(
            () => null,
            (err) => err,
        );
        expect(error).toBeInstanceOf(EmailConfigurationError);
        expect(error.code).toBe("disabled");
        expect(isEmailDeliveryDisabledError(error)).toBe(true);
    });

    test("fails when the referenced secret is missing", async () => {
        const emailer = new ConfiguredEmailer({
            readSettings: async () => enabledSettings(),
            secrets: { get: async () => null },
        });

        const error = await emailer.send(message()).then(
            () => null,
            (err) => err,
        );
        expect(error).toBeInstanceOf(EmailConfigurationError);
        expect(error.code).toBe("missing_secret");
        expect(isEmailDeliveryDisabledError(error)).toBe(false);
    });
});

function enabledSettings(overrides: Partial<RuntimeEmailSettings["smtp"]> = {}): RuntimeEmailSettings {
    return {
        enabled: true,
        fromEmail: "no-reply@example.com",
        fromName: "CMS",
        replyTo: "support@example.com",
        transport: "smtp",
        smtp: {
            host: "smtp.example.com",
            port: 587,
            secure: false,
            username: "postmaster@example.com",
            passwordSecretRef: "${SMTP_PASSWORD}",
            ...overrides,
        },
    };
}

function message() {
    return {
        to: { email: "ada@example.com" },
        subject: "Hello",
        text: "Plain",
    };
}
