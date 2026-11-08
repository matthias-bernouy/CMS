import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    createRepositoryInputSchema,
    repositorySettingsOutputSchema,
} from "repository/application/installations/schemas/initialization/repository";
import { initializationApplyErrors } from "repository/application/installations/schemas/initialization/apply";
import {
    authorizeRepositorySettings,
    repositorySettings,
} from "repository/application/installations/core/repositorySettings";
import { initializationAdministrator } from "repository/application/installations/core/initialization";
export const createRepository = defineCapability({
    id: "initialization.repository.create",
    access: "admin",
    description:
        "Create this instance’s Repository from its approved system manifest. The durable instance transition owns recovery; its catalogue starts empty.",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" },
    input: createRepositoryInputSchema,
    output: repositorySettingsOutputSchema,
    errors: initializationApplyErrors,
    docs: ["repository-settings.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/initialization/repository/create",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    NOT_FOUND: 404,
                    REVISION_CONFLICT: 409,
                    UPGRADE_IN_PROGRESS: 423,
                    INVALID_INPUT: 422,
                    CORE_UNAVAILABLE: 503,
                    FORBIDDEN: 403,
                    RELEASE_MISMATCH: 409,
                    IDEMPOTENCY_CONFLICT: 409,
                    IDEMPOTENCY_KEY_REQUIRED: 422,
                    PROVIDER_SHUTTING_DOWN: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_createRepository",
                description: "Create or resume this instance’s Repository.",
            },
        },
    ],
    authorize: authorizeRepositorySettings,
    execute: async ({ services, context, input }) =>
        repositorySettings(services, context).create(input, await initializationAdministrator(services, context)),
});
