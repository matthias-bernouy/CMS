import { defineCapability } from "cms-repository/application/authoring/capabilities/define";
import {
    namespaceInventoryInputSchema,
    namespaceInventorySchema,
} from "cms-repository/application/authoring/schemas/namespaces";
import { authoringErrors as errors } from "cms-repository/application/authoring/schemas/errors";
export const listNamespaces = defineCapability({
    id: "list-namespaces",
    description:
        "Read the configured Repository account namespace inventory live. Follow nextCursor; only active owned namespaces permit publication.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/list-namespaces",
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
                name: "authoring_list_namespaces",
                description:
                    "Read the configured Repository account namespace inventory live. Follow nextCursor; only active owned namespaces permit publication.",
            },
        },
    ],
    docs: ["overview.md", "collection-authoring.md"],
    input: namespaceInventoryInputSchema,
    output: namespaceInventorySchema,
    errors,
    execute: ({ services, input }) => services.authoring.listNamespaces(input),
});
