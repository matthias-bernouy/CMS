import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    repositorySettingsInputSchema,
    repositorySettingsOutputSchema,
} from "repository/application/installations/schemas/initialization/repository";
import { initializationApplyErrors } from "repository/application/installations/schemas/initialization/apply";
import {
    authorizeRepositorySettings,
    repositorySettings,
} from "repository/application/installations/core/repositorySettings";

export const getRepositorySettings = defineCapability({
    id: "initialization.repository.get",
    access: "admin",
    description: "Read this site’s Repository address and whether Registry is actually installed.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: repositorySettingsInputSchema,
    output: repositorySettingsOutputSchema,
    errors: initializationApplyErrors,
    docs: ["repository-settings.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/initialization/repository",
            input: {},
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
            tool: { name: "installations_getRepositorySettings", description: "Read this site’s Repository settings." },
        },
    ],
    authorize: authorizeRepositorySettings,
    execute: async ({ services, context }) => {
        await authorizeRepositorySettings({ services, context });
        return repositorySettings(services, context).get();
    },
});
