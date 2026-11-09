import { defineCapability } from "repository/application/authoring/capabilities/define";
import {
    getSourceSnapshotInputSchema,
    expandedSourceSnapshotSchema,
} from "repository/application/authoring/schemas/sources";
import { authoringErrors as errors } from "repository/application/authoring/schemas/errors";

export const getSourceSnapshot = defineCapability({
    id: "get-source-snapshot",
    description: "Read private immutable sources up to 8 MiB through the connected Repository account.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-source-snapshot",
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
                name: "authoring_get_source_snapshot",
                description: "Read private sources up to 8 MiB for a collection, contract or Provider manifest.",
            },
        },
    ],
    docs: ["overview.md", "collection-source.md", "contract-source.md"],
    input: getSourceSnapshotInputSchema,
    output: expandedSourceSnapshotSchema,
    errors,
    execute: ({ services, input }) =>
        input.kind === "collection"
            ? services.authoring.sources(input.namespace, input.id, input.version)
            : services.authoring.artifactSources(input.kind, input.namespace, input.id, input.version),
});
