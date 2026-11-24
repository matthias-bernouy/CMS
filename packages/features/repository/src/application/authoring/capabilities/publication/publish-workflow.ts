import { defineCapability } from "repository/application/authoring/capabilities/define";
import { publishInputSchema, publishWorkflowOutputSchema } from "repository/application/authoring/schemas/publication";
import { publicationErrors as errors } from "repository/application/authoring/schemas/errors";
import { requiredText } from "repository/application/authoring/core/input";
export const publishWorkflow = defineCapability({
    id: "publish-workflow",
    description:
        "Publish the exact prepared workflow digest and retain its private sources. This does not install or deploy it.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/publish-workflow",
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
                name: "authoring_publish_workflow",
                description:
                    "Publish the exact prepared workflow digest and retain its private sources. This does not install or deploy it.",
            },
        },
    ],
    docs: ["overview.md", "artifact-authoring.md", "sources/workflow-source.md"],
    input: publishInputSchema,
    output: publishWorkflowOutputSchema,
    errors,
    execute: ({ services, input }) =>
        services.authoring.publishArtifact(
            "workflow",
            requiredText(input.preparationId),
            requiredText(input.expectedDigest),
        ),
});
