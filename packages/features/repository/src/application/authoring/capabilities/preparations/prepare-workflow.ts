import { defineCapability } from "repository/application/authoring/capabilities/define";
import { prepareInputSchema, prepareWorkflowOutputSchema } from "repository/application/authoring/schemas/preparations";
import { authoringErrors as errors } from "repository/application/authoring/schemas/errors";
import { prepareCandidate } from "repository/application/authoring/core/preparation";
import { requiredText } from "repository/application/authoring/core/input";
export const prepareWorkflow = defineCapability({
    id: "prepare-workflow",
    description: "Validate and prepare workflow source files without publication or installation.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/prepare-workflow",
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
                name: "authoring_prepare_workflow",
                description: "Validate and prepare workflow source files without publication or installation.",
            },
        },
    ],
    docs: ["overview.md", "artifact-authoring.md", "sources/workflow-source.md"],
    input: prepareInputSchema,
    output: prepareWorkflowOutputSchema,
    errors,
    execute: ({ services, input }) => prepareCandidate(services.authoring, "workflow", requiredText(input.sourceJson)),
});
