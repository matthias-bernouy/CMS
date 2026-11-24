import { defineCapability } from "repository/application/authoring/capabilities/define";
import {
    getWorkflowSourcesInputSchema,
    expandedSourceSnapshotSchema,
} from "repository/application/authoring/schemas/sources";
import { authoringErrors as errors } from "repository/application/authoring/schemas/errors";
import { requiredText } from "repository/application/authoring/core/input";
export const getWorkflowSources = defineCapability({
    id: "get-workflow-sources",
    description: "Read private workflow sources owned by the connected Repository account.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-workflow-sources",
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
                name: "authoring_get_workflow_sources",
                description: "Read private workflow sources owned by the connected Repository account.",
            },
        },
    ],
    docs: ["overview.md", "artifact-authoring.md", "sources/workflow-source.md"],
    input: getWorkflowSourcesInputSchema,
    output: expandedSourceSnapshotSchema,
    errors,
    execute: ({ services, input }) =>
        Promise.resolve(
            services.authoring.artifactSources(
                "workflow",
                requiredText(input.namespace),
                requiredText(input.workflowId),
                requiredText(input.version),
            ),
        ),
});
