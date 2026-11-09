import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { installCollectionOutputSchema } from "repository/application/installations/schemas/collections/install-collection";
import { updateCollectionConfigurationInputSchema } from "repository/application/installations/schemas/collections/update-collection-configuration";
import { updateCollectionConfigurationErrors as errors } from "repository/application/installations/schemas/common/failures";
import { configureCollection } from "repository/application/installations/core/collections/configuration";
export const updateCollectionConfiguration = defineCapability({
    id: "update-collection-configuration",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/update-collection-configuration",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, NOT_FOUND: 404, REVISION_CONFLICT: 409, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_update_collection_configuration",
                description:
                    "Update site-owned configuration for an installed collection using the current installation expectedRevision.",
            },
        },
    ],
    docs: ["overview.md"],
    input: updateCollectionConfigurationInputSchema,
    output: installCollectionOutputSchema,
    errors,
    execute: ({ services, input, context }) => configureCollection(services, context.siteId, input),
});
