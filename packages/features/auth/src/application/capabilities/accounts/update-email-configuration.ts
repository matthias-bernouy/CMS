import { defineCapability } from "auth/application/capabilities/define";
import { inputErrors, setAdministratorErrors } from "auth/application/schemas/errors";
import { accountEmailConfigurationViewSchema, updateAccountEmailsSchema } from "auth/email/templates/schemas";

export const updateEmailConfiguration = defineCapability({
    id: "update-email-configuration",
    description: "Validate and replace the exact email-template publications used by account flows.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" },
    input: updateAccountEmailsSchema,
    output: accountEmailConfigurationViewSchema,
    errors: { ...inputErrors, REVISION_CONFLICT: setAdministratorErrors.REVISION_CONFLICT },
    docs: ["email-templates.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "PUT",
            path: "/accounts/email-configuration/update",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503, REVISION_CONFLICT: 409 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "accounts_update_email_configuration",
                description: "Manage the account email-template publication associations.",
            },
        },
    ],
    execute: ({ input, services }) => services.accountEmailTemplates.update(input),
});
