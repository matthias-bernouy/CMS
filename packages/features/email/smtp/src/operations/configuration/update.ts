import { defineOperation } from "@bernouy/ulvia-sdk";
import { emailErrorSchema } from "@bernouy/email/schemas";
import { smtpConfigurationSchema, smtpConfigurationUpdateSchema } from "email-smtp/schemas/configuration";

export const updateSmtpConfiguration = defineOperation({
    description: "Replace SMTP email delivery configuration and optionally rotate its password.",
    input: smtpConfigurationUpdateSchema,
    output: smtpConfigurationSchema,
    errors: {
        INVALID_INPUT: { retryable: false, output: emailErrorSchema },
        CORE_UNAVAILABLE: { retryable: true, output: emailErrorSchema },
    },
    docs: ["overview.md"],
});
