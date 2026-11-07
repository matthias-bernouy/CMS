import { defineCapability } from "email-smtp/capabilities/define";
import { emailErrorSchema } from "@bernouy/email";
import { getSmtpConfigurationInputSchema, smtpConfigurationSchema } from "email-smtp/schemas/configuration";

export const getSmtpConfiguration = defineCapability({
    id: "smtp.configuration.get",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/configuration",
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503 },
            },
        },
    ],

    description: "Read SMTP email delivery configuration without returning credentials.",
    input: getSmtpConfigurationInputSchema,
    output: smtpConfigurationSchema,
    errors: { CORE_UNAVAILABLE: { retryable: true, output: emailErrorSchema } },
    docs: ["overview.md"],
    execute: async ({ services, fail }) => {
        try {
            return await services.emailer.getConfiguration();
        } catch (cause) {
            throw fail("CORE_UNAVAILABLE", { message: "Email configuration is unavailable." }, { cause });
        }
    },
});
