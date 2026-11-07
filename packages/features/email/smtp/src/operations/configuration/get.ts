import { defineOperation } from "@bernouy/ulvia-sdk";
import { emailErrorSchema } from "@bernouy/email/schemas";
import { getSmtpConfigurationInputSchema, smtpConfigurationSchema } from "email-smtp/schemas/configuration";

export const getSmtpConfiguration = defineOperation({
    description: "Read SMTP email delivery configuration without returning credentials.",
    input: getSmtpConfigurationInputSchema,
    output: smtpConfigurationSchema,
    errors: { CORE_UNAVAILABLE: { retryable: true, output: emailErrorSchema } },
    docs: ["overview.md"],
});
