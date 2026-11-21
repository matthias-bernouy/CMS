import { expect, test } from "bun:test";
import { assertSmtpConfiguration } from "./configuration";

test("SMTP persistence assertions require exact public configuration without exposing stored passwords", () => {
    const input = {
        enabled: false,
        fromEmail: "sender@example.test",
        fromName: "Fixture",
        replyTo: "",
        smtp: {
            host: "performance-mail",
            port: 2525,
            secure: false,
            username: "performance",
            password: "private-fixture-value",
        },
    };
    const output = {
        ...input,
        smtp: {
            host: "performance-mail",
            port: 2525,
            secure: false,
            username: "performance",
            passwordConfigured: true,
        },
    };
    expect(() => assertSmtpConfiguration(output, input)).not.toThrow();
    expect(() => assertSmtpConfiguration(input, input)).toThrow();
    expect(() =>
        assertSmtpConfiguration({ ...output, smtp: { ...output.smtp, passwordConfigured: false } }, input),
    ).toThrow();
    expect(() => assertSmtpConfiguration({ ...output, fromName: "stale" }, input)).toThrow();
});
