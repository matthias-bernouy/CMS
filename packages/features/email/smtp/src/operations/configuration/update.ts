import { defineOperation } from "@bernouy/ulvia-sdk";
import { emailErrorSchema } from "@bernouy/email/schemas";
import { smtpConfigurationSchema, smtpConfigurationUpdateSchema } from "email-smtp/schemas/configuration";

export const updateSmtpConfiguration = defineOperation({
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
});
