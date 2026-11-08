import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    getCollectionInstallationInputSchema,
    getCollectionInstallationOutputSchema,
} from "repository/application/installations/schemas/collections/get-collection-installation";
import { getCollectionInstallationErrors as errors } from "repository/application/installations/schemas/common/failures";
import { installedCollection } from "repository/application/installations/core/collections/queries";
export const getCollectionInstallation = defineCapability({
    id: "get-collection-installation",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-collection-installation",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_get_collection_installation",
                description:
                    "Read an installed collection, its configuration and the current site installation revision.",
            },
        },
    ],
    docs: ["overview.md"],
    input: getCollectionInstallationInputSchema,
    output: getCollectionInstallationOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        installedCollection(services.collections, context.siteId, input.collectionId),
});
