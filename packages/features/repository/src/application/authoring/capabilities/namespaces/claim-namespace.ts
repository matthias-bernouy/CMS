import { defineCapability } from "repository/application/authoring/capabilities/define";
import { claimNamespaceInputSchema, claimedNamespaceSchema } from "repository/application/authoring/schemas/namespaces";
import { authoringErrors as errors } from "repository/application/authoring/schemas/errors";
import { requiredText } from "repository/application/authoring/core/input";
export const claimNamespace = defineCapability({
    id: "claim-namespace",
    description:
        "Claim a namespace for the Repository account authenticated by the configured PAT. Existing ownership is preserved.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/claim-namespace",
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
                name: "authoring_claim_namespace",
                description:
                    "Claim a namespace for the Repository account authenticated by the configured PAT. Existing ownership is preserved.",
            },
        },
    ],
    docs: ["overview.md", "collection-authoring.md"],
    input: claimNamespaceInputSchema,
    output: claimedNamespaceSchema,
    errors,
    execute: ({ services, input }) => services.authoring.claim(requiredText(input.namespace)),
});
