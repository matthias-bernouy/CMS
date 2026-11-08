import { defineCapability } from "repository/application/authoring/capabilities/define";
import {
    discardPreparationInputSchema,
    discardPreparationOutputSchema,
} from "repository/application/authoring/schemas/preparations";
import { authoringErrors as errors } from "repository/application/authoring/schemas/errors";
import { requiredText } from "repository/application/authoring/core/input";
export const discardPreparation = defineCapability({
    id: "discard-preparation",
    description:
        "Discard one local unpublished collection, contract or Provider manifest preparation. Published releases are preserved.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/discard-preparation",
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
                name: "authoring_discard_preparation",
                description:
                    "Discard one local unpublished collection, contract or Provider manifest preparation. Published releases are preserved.",
            },
        },
    ],
    docs: ["overview.md", "collection-authoring.md", "artifact-authoring.md"],
    input: discardPreparationInputSchema,
    output: discardPreparationOutputSchema,
    errors,
    execute: ({ services, input }) => services.authoring.discard(requiredText(input.preparationId)),
});
