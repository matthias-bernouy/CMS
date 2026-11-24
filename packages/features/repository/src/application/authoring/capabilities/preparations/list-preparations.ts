import { defineCapability } from "repository/application/authoring/capabilities/define";
import {
    preparationInventoryInputSchema,
    preparationInventorySchema,
} from "repository/application/authoring/schemas/preparations/inventory";
import { authoringErrors as errors } from "repository/application/authoring/schemas/errors";

export const listPreparations = defineCapability({
    id: "list-preparations",
    description:
        "List local preparations with resource identities, expiration and publication state. Follow nextCursor, then explicitly discard a selected preparation to free quota. No source content or credentials are returned.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/list-preparations",
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
                name: "authoring_list_preparations",
                description:
                    "List local preparation IDs, resources, expiry and publication state. Follow nextCursor and explicitly select an ID for discard-preparation to free quota.",
            },
        },
    ],
    docs: ["overview.md", "collection-authoring.md", "artifact-authoring.md"],
    input: preparationInventoryInputSchema,
    output: preparationInventorySchema,
    errors,
    execute: ({ services, input }) => services.authoring.listPreparations(input),
});
