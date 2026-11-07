import {
    normalizedSmtpConfigurationUpdateSchema,
    normalizedStoredSmtpConfigurationSchema,
} from "email-smtp/schemas/configuration";
import type { StoredConfiguration } from "email-smtp/interfaces/SmtpEmailerConfiguration";
import { SmtpEmailConfigurationError } from "email-smtp/core/SmtpEmailConfigurationError";

export function configurationUpdate(value: unknown) {
    const parsed = normalizedSmtpConfigurationUpdateSchema.safeParse(value);
    if (!parsed.success) {
        throw invalidConfiguration(parsed.error.issues);
    }
    return parsed.data;
}

export function storedConfiguration(value: unknown): StoredConfiguration {
    const parsed = normalizedStoredSmtpConfigurationSchema.safeParse(value);
    if (!parsed.success) {
        throw invalidConfiguration(parsed.error.issues);
    }
    return parsed.data;
}

function invalidConfiguration(
    issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): SmtpEmailConfigurationError {
    const semantic = issues.find(({ message }) => ["smtp.sender", "smtp.reply", "smtp.credentials"].includes(message));
    const code =
        semantic?.message ??
        (issues.some(({ path }) => path[0] === "smtp" && path[1] === "port") ? "smtp.port" : "smtp.invalid");
    // Schema diagnostics may contain secrets; expose only stable domain reasons.
    return new SmtpEmailConfigurationError("Email delivery configuration is invalid.", "invalid_configuration", {
        code,
    });
}
