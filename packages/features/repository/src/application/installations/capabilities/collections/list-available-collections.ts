import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    listAvailableCollectionsInputSchema,
    listAvailableCollectionsOutputSchema,
} from "repository/application/installations/schemas/collections/list-available-collections";
import { listAvailableCollectionsErrors as errors } from "repository/application/installations/schemas/common/failures";
import { availableCollections } from "repository/application/installations/core/collections/queries";
export const listAvailableCollections = defineCapability({
    id: "list-available-collections",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/list-available-collections",
            input: { query: { channel: "channel" } },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CATALOGUE_TOO_LARGE: 422, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_list_available_collections",
                description:
                    "List releases from the configured Repositories, their browser-risk digests and whether they can be installed or upgraded.",
            },
        },
    ],
    docs: ["overview.md"],
    input: listAvailableCollectionsInputSchema,
    output: listAvailableCollectionsOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        availableCollections(services, context.siteId, input.channel, context.signal),
});
