import { expect, test } from "bun:test";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { ConfiguredSmtpEmailer } from "@bernouy/email-smtp/nodemailer";
import { executeCapability } from "@bernouy/ulvia-sdk/provider";
import { getSmtpConfiguration } from "email-smtp/capabilities/configuration/get";
import { updateSmtpConfiguration } from "email-smtp/capabilities/configuration/update";
import { emailerFeature } from "@bernouy/email/feature";
const [sendEmail] = emailerFeature.capabilities;
import { SmtpEmailConfigurationError } from "@bernouy/email-smtp";

const context = { requestId: "request-a", contractVersion: "1.0.0", siteId: "site-a", providerId: "example/provider" };
const configuration = {
    enabled: true,
    fromEmail: "sender@example.test",
    fromName: "Sender",
    replyTo: "",
    smtp: { host: "smtp.example.test", port: 587, secure: false, username: "sender", password: " private-password " },
};

test("operation executions configure the injected service and reuse base Emailer delivery", async () => {
    const messages: unknown[] = [];
    const secrets = new InMemorySecretStore();
    const emailer = new ConfiguredSmtpEmailer({
        secrets,
        transportFactory: async () => ({
            sendMail: async (input) => {
                messages.push(input);
            },
        }),
    });
    const dependencies = { emailer };
    const result = await executeCapability(updateSmtpConfiguration, {
        input: configuration,
        services: dependencies,
        context,
    });
    expect(await executeCapability(getSmtpConfiguration, { input: {}, services: dependencies, context })).toEqual(
        result,
    );
    expect(JSON.stringify(result)).not.toContain("private-password");
    expect(await secrets.get("SMTP_EMAILER_CONFIGURATION")).toContain('"password":"private-password"');
    expect(configuration.smtp.password).toBe(" private-password ");
    expect(
        await executeCapability(sendEmail, {
            input: { toEmail: "ada@example.test", subject: "Hello", text: "Body" },
            services: dependencies,
            context,
        }),
    ).toEqual({
        sent: true,
    });
    expect(messages).toHaveLength(1);
});

test("invalid configuration refuses without changing stored credentials or invoking delivery", async () => {
    const secrets = new InMemorySecretStore();
    let sends = 0;
    const emailer = new ConfiguredSmtpEmailer({
        secrets,
        transportFactory: async () => ({
            sendMail: async () => {
                sends++;
            },
        }),
    });
    await emailer.updateConfiguration(configuration);
    const before = await secrets.get("SMTP_EMAILER_CONFIGURATION");
    for (const input of [
        { ...configuration, smtp: { ...configuration.smtp, password: " " } },
        { ...configuration, fromEmail: "invalid" },
    ]) {
        await expect(
            executeCapability(updateSmtpConfiguration, { input, services: { emailer }, context }),
        ).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(await secrets.get("SMTP_EMAILER_CONFIGURATION")).toBe(before);
    }
    expect(sends).toBe(0);
});

test("SMTP domain errors flow through inherited execution while retaining the original operation and domain cause", async () => {
    const cause = new SmtpEmailConfigurationError("private-password", "invalid_configuration", {
        code: "smtp.credentials",
    });
    const dependencies = {
        emailer: {
            isEnabled: async () => true,
            getConfiguration: async () => {
                throw cause;
            },
            updateConfiguration: async () => {
                throw cause;
            },
            send: async () => {
                throw cause;
            },
        },
    };
    await expect(
        executeCapability(sendEmail, {
            input: { toEmail: "ada@example.test", subject: "Hello", text: "Body" },
            services: dependencies,
            context,
        }),
    ).rejects.toMatchObject({
        capability: sendEmail,
        code: "INVALID_INPUT",
        cause,
    });
    await expect(
        executeCapability(getSmtpConfiguration, { input: {}, services: dependencies, context }),
    ).rejects.toMatchObject({
        code: "CORE_UNAVAILABLE",
        cause,
    });
});
