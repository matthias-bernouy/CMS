import { defineCapability } from "repository/application/authoring/capabilities/define";
import {
    getCollectionSourcesInputSchema,
    sourceSnapshotSchema,
} from "repository/application/authoring/schemas/sources";
import { authoringErrors as errors } from "repository/application/authoring/schemas/errors";
import { requiredText } from "repository/application/authoring/core/input";
export const getCollectionSources = defineCapability({
    id: "get-collection-sources",
    description: "Read the private source snapshot of a collection owned by the configured Repository account.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-collection-sources",
            input: { body: true },
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
                name: "authoring_get_collection_sources",
                description:
                    "Read the private source snapshot of a collection owned by the configured Repository account.",
            },
        },
    ],
    docs: ["overview.md", "collection-authoring.md", "collection-source.md"],
    input: getCollectionSourcesInputSchema,
    output: sourceSnapshotSchema,
    errors,
    execute: ({ services, input }) =>
        services.authoring.sources(
            requiredText(input.namespace),
            requiredText(input.collectionId),
            requiredText(input.version),
        ),
});
