import { expect, test } from "bun:test";
import { EmailDeliveryDisabledError } from "@bernouy/email";
import type { EmailerServices } from "@bernouy/email/feature";
import type { OutboundEmail } from "@bernouy/email";
import { executeCapability } from "@bernouy/ulvia-sdk/provider";
import { emailerFeature } from "email/feature";
import { sendEmail } from "email/capabilities/send";

const context = { requestId: "request-a", contractVersion: "1.0.0", siteId: "site-a", providerId: "example/provider" };
const input = { toEmail: "ada@example.test", subject: "Hello", text: "Body" };

test("operation execution uses injected services and adapt wire fields without mutating input", async () => {
    const messages: OutboundEmail[] = [];
    const services: EmailerServices = {
        emailer: {
            isEnabled: async () => true,
            send: async (email) => {
                messages.push(email);
            },
        },
    };
    expect(messages).toHaveLength(0);
    const source = { ...input, subject: " Hello ", text: " Body ", html: " <p>Body</p> ", toName: "Ada" };
    expect(await executeCapability(emailerFeature, sendEmail.id, { input: source, services, context })).toEqual({
        sent: true,
    });
    expect(messages).toEqual([
        { to: { email: input.toEmail, displayName: "Ada" }, subject: "Hello", text: "Body", html: "<p>Body</p>" },
    ]);
    expect(source.subject).toBe(" Hello ");
});

test("empty required text refuses before the injected delivery port is called", async () => {
    let sends = 0;
    const services: EmailerServices = {
        emailer: {
            isEnabled: async () => true,
            send: async () => {
                sends++;
            },
        },
    };
    for (const field of ["subject", "text", "html"] as const) {
        await expect(
            executeCapability(emailerFeature, sendEmail.id, { input: { ...input, [field]: " " }, services, context }),
        ).rejects.toMatchObject({
            capability: sendEmail,
            code: "INVALID_INPUT",
        });
    }
    expect(sends).toBe(0);
});

test("disabled and unexpected delivery failures retain operation ownership and safe public payloads", async () => {
    for (const [cause, code] of [
        [new EmailDeliveryDisabledError(), "EMAIL_DISABLED"],
        [new Error("private-smtp-password"), "CORE_UNAVAILABLE"],
    ] as const) {
        const services: EmailerServices = {
            emailer: {
                isEnabled: async () => true,
                send: async () => {
                    throw cause;
                },
            },
        };
        const failure = await executeCapability(emailerFeature, sendEmail.id, { input, services, context }).then(
            () => {
                throw new Error("Expected failure");
            },
            (error: unknown) => error,
        );
        expect(failure).toMatchObject({ capability: sendEmail, code, cause });
        expect(JSON.stringify(failure)).not.toContain("private-smtp-password");
    }
});
