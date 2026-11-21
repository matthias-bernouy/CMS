import { z } from "@bernouy/ulvia-sdk";
import { defineCapability } from "auth/application/capabilities/define";
import { inputErrors } from "auth/application/schemas/errors";
import { accountEmailConfigurationViewSchema } from "auth/email/templates/schemas";

export const getEmailConfiguration = defineCapability({
    id: "get-email-configuration",
    description: "Read the exact email-template publications used by account flows.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: z.strictObject({}),
    output: accountEmailConfigurationViewSchema,
    errors: inputErrors,
    docs: ["email-templates.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/accounts/email-configuration/get",
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "accounts_get_email_configuration",
                description: "Manage the account email-template publication associations.",
            },
        },
    ],
    execute: ({ services }) => services.accountEmailTemplates.get(),
});
