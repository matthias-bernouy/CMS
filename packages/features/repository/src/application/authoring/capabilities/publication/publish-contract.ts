import { defineCapability } from "repository/application/authoring/capabilities/define";
import { publishInputSchema, publishContractOutputSchema } from "repository/application/authoring/schemas/publication";
import { publicationErrors as errors } from "repository/application/authoring/schemas/errors";
import { requiredText } from "repository/application/authoring/core/input";
export const publishContract = defineCapability({
    id: "publish-contract",
    description:
        "Publish the exact prepared contract digest and retain its private sources. This does not install or deploy it.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/publish-contract",
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
                name: "authoring_publish_contract",
                description:
                    "Publish the exact prepared contract digest and retain its private sources. This does not install or deploy it.",
            },
        },
    ],
    docs: ["overview.md", "artifact-authoring.md", "contract-source.md"],
    input: publishInputSchema,
    output: publishContractOutputSchema,
    errors,
    execute: ({ services, input }) =>
        services.authoring.publishArtifact(
            "contract",
            requiredText(input.preparationId),
            requiredText(input.expectedDigest),
        ),
});
