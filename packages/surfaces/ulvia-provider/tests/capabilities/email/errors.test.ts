import { expect, test } from "bun:test";
import { ConfiguredSmtpEmailer } from "@bernouy/email-smtp/nodemailer";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { invokeHttp, resolvedContract } from "../../execution/messages/fixtures";
import { emailReleases, smtpOptions } from "./fixture";

const configuration = {
    enabled: true,
    fromEmail: "sender@example.test",
    fromName: "Sender",
    replyTo: "",
    smtp: { host: "smtp.example.test", port: 587, secure: false, username: "sender", password: "private-password" },
};

test("feature-owned SMTP failures retain official domain reasons and isolated request languages without writes", async () => {
    const secrets = new InMemorySecretStore();
    const emailer = new ConfiguredSmtpEmailer({ secrets });
    await emailer.updateConfiguration(configuration);
    const before = await secrets.get("SMTP_EMAILER_CONFIGURATION");
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(dispatcher, { emailer }, await emailReleases(), smtpOptions("default"));
    const feature = await resolvedContract("ulvia/cms.emailer.smtp");
    const responses = await Promise.all(
        ["fr", "en"].map((language) =>
            invokeHttp(
                feature,
                dispatcher,
                "smtp.configuration.update",
                { ...configuration, fromEmail: "invalid" },
                language,
            ),
        ),
    );
    for (const [index, response] of responses.entries()) {
        expect(response.status).toBe(422);
        expect(response.headers.get("content-language")).toBe(index === 0 ? "fr" : "en");
        expect(await response.json()).toEqual({
            error: {
                code: "INVALID_INPUT",
                output: {
                    message:
                        index === 0
                            ? "Une adresse e-mail d’expéditeur valide est obligatoire pour activer l’envoi."
                            : "A valid sender email address is required to enable delivery.",
                },
            },
        });
    }
    expect(await secrets.get("SMTP_EMAILER_CONFIGURATION")).toBe(before);
});

test("unexpected feature-port failures expose only safe localized contract data", async () => {
    const emailer = {
        isEnabled: async () => true,
        send: async () => {},
        getConfiguration: async () => {
            throw new Error("private-password");
        },
        updateConfiguration: async () => {
            throw new Error("private-password");
        },
    };
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(dispatcher, { emailer }, await emailReleases(), smtpOptions("default"));
    const response = await invokeHttp(
        await resolvedContract("ulvia/cms.emailer.smtp"),
        dispatcher,
        "smtp.configuration.update",
        configuration,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("content-language")).toBe("fr");
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({
        error: { code: "CORE_UNAVAILABLE", output: { message: expect.any(String) } },
    });
    expect(text).not.toContain("private-password");
});
