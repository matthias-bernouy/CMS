import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    configureRepositoryInputSchema,
    repositorySettingsOutputSchema,
} from "repository/application/installations/schemas/initialization/repository";
import { initializationApplyErrors } from "repository/application/installations/schemas/initialization/apply";
import {
    authorizeRepositorySettings,
    repositorySettings,
} from "repository/application/installations/core/repositorySettings";
export const configureRepository = defineCapability({
    id: "initialization.repository.configure",
    access: "admin",
    description: "Change this site’s Repository address without altering its installed contracts.",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" },
    input: configureRepositoryInputSchema,
    output: repositorySettingsOutputSchema,
    errors: initializationApplyErrors,
    docs: ["repository-settings.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/initialization/repository",
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
                name: "installations_configureRepository",
                description: "Configure this site’s Repository settings.",
            },
        },
    ],
    authorize: authorizeRepositorySettings,
    execute: ({ services, context, input }) => repositorySettings(services, context).configure(input),
});
