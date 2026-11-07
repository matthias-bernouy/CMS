import { smtpConfigurationUpdateSchema, storedSmtpConfigurationSchema } from "email-smtp/schemas/configuration";
import type { StoredConfiguration } from "email-smtp/interfaces/SmtpEmailerConfiguration";
import { SmtpEmailConfigurationError } from "./SmtpEmailConfigurationError";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function configurationUpdate(value: unknown) {
    const parsed = smtpConfigurationUpdateSchema.safeParse(value);
    if (!parsed.success) {
        throw invalidConfiguration(parsed.error.issues);
    }
    return parsed.data;
}

export function storedConfiguration(value: unknown): StoredConfiguration {
    const parsed = storedSmtpConfigurationSchema.safeParse(value);
    if (!parsed.success) {
        throw invalidConfiguration(parsed.error.issues);
    }
    const input = parsed.data;
    const configuration = {
        ...input,
        fromEmail: input.fromEmail.trim(),
        fromName: input.fromName.trim(),
        replyTo: input.replyTo.trim(),
        smtp: { ...input.smtp, host: input.smtp.host.trim(), username: input.smtp.username.trim() },
    };
    if (configuration.enabled) {
        if (!EMAIL_PATTERN.test(configuration.fromEmail)) {
            throw new SmtpEmailConfigurationError(
                "Enabled email delivery requires a valid sender address.",
                "invalid_configuration",
                { code: "smtp.sender" },
            );
        }
        if (configuration.replyTo && !EMAIL_PATTERN.test(configuration.replyTo)) {
            throw new SmtpEmailConfigurationError("Email reply-to address is invalid.", "invalid_configuration", {
                code: "smtp.reply",
            });
        }
        if (!configuration.smtp.host || !configuration.smtp.username || !configuration.smtp.password) {
            throw new SmtpEmailConfigurationError(
                "Enabled email delivery requires complete SMTP credentials.",
                "invalid_configuration",
                { code: "smtp.credentials" },
            );
        }
    }
    return configuration;
}

function invalidConfiguration(
    issues: readonly { readonly path: readonly PropertyKey[] }[],
): SmtpEmailConfigurationError {
    if (issues.some(({ path }) => path[0] === "smtp" && path[1] === "port")) {
        return new SmtpEmailConfigurationError(
            "SMTP port must be an integer between 1 and 65535.",
            "invalid_configuration",
            { code: "smtp.port" },
        );
    }
    // Schema diagnostics may contain secrets; expose only stable domain reasons.
    return new SmtpEmailConfigurationError("Email delivery configuration is invalid.");
}
