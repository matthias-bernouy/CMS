import { defineCapability } from "cms-repository/application/authoring/capabilities/define";
import { emptyInputSchema } from "cms-repository/application/authoring/schemas/common";
import { connectionStatusSchema } from "cms-repository/application/authoring/schemas/connection";
import { authoringErrors as errors } from "cms-repository/application/authoring/schemas/errors";
export const getConnection = defineCapability({
    id: "get-connection",
    description: "Read the configured publication Repository origin and identity without revealing its PAT.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/get-connection",
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
                name: "authoring_get_connection",
                description:
                    "Read the configured publication Repository origin and identity without revealing its PAT.",
            },
        },
    ],
    docs: ["overview.md", "collection-authoring.md"],
    input: emptyInputSchema,
    output: connectionStatusSchema,
    errors,
    execute: ({ services }) => services.authoring.connectionStatus(),
});
