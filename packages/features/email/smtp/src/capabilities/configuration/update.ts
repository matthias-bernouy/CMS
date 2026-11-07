import { SmtpEmailConfigurationError } from "email-smtp/core/SmtpEmailConfigurationError";
import { defineCapability } from "email-smtp/capabilities/define";
import { emailErrorSchema } from "@bernouy/email";
import { smtpConfigurationSchema, smtpConfigurationUpdateSchema } from "email-smtp/schemas/configuration";

export const updateSmtpConfiguration = defineCapability({
    id: "smtp.configuration.update",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/configuration",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
    ],

    description: "Replace SMTP email delivery configuration and optionally rotate its password.",
    input: smtpConfigurationUpdateSchema,
    output: smtpConfigurationSchema,
    errors: {
        INVALID_INPUT: { retryable: false, output: emailErrorSchema },
        CORE_UNAVAILABLE: { retryable: true, output: emailErrorSchema },
    },
    docs: ["overview.md"],
    execute: async ({ input, services, fail }) => {
        try {
            return await services.emailer.updateConfiguration(input);
        } catch (cause) {
            if (cause instanceof SmtpEmailConfigurationError) {
                throw fail("INVALID_INPUT", { message: "Email configuration is invalid." }, { cause });
            }
            throw fail("CORE_UNAVAILABLE", { message: "Email configuration is unavailable." }, { cause });
        }
    },
});
