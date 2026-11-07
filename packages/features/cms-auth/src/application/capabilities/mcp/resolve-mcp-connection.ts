import { defineCapability } from "cms-auth/application/capabilities/define";
import { executeMcp } from "cms-auth/application/core/access/mcp";
import { mcpRequestSchema, mcpResultSchema } from "cms-auth/application/schemas/mcp";
import { inputErrors as errors } from "cms-auth/application/schemas/errors";

export const resolveMcpConnection = defineCapability({
    id: "resolve-mcp-connection",
    description: "Resolve mcp connection",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/resolve-mcp-connection",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: mcpRequestSchema,
    output: mcpResultSchema,
    errors,
    execute: ({ input, services, context }) => executeMcp("resolve", input.requestJson, services, context),
});
