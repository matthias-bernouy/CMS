import { defineCapability } from "cms-repository/application/authoring/capabilities/define";
import {
    prepareCollectionInputSchema,
    prepareCollectionOutputSchema,
} from "cms-repository/application/authoring/schemas/preparations";
import { authoringErrors as errors } from "cms-repository/application/authoring/schemas/errors";
import { prepareCandidate } from "cms-repository/application/authoring/core/preparation";
import { requiredText } from "cms-repository/application/authoring/core/input";
export const prepareCollection = defineCapability({
    id: "prepare-collection",
    description:
        "Validate and build a complete collection source snapshot. Read the source and Bloc design guides. Preparation does not publish or establish visual quality.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/prepare-collection",
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
                name: "authoring_prepare_collection",
                description:
                    "Validate and build a complete collection source snapshot. Read the source and Bloc design guides. Preparation does not publish or establish visual quality.",
            },
        },
    ],
    docs: ["overview.md", "collection-authoring.md", "collection-source.md", "bloc-design.md"],
    input: prepareCollectionInputSchema,
    output: prepareCollectionOutputSchema,
    errors,
    execute: ({ services, input }) =>
        prepareCandidate(services.authoring, "collection", requiredText(input.sourceJson)),
});
