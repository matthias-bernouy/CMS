import { defineCapability } from "auth/application/capabilities/define";
import { executeMcp } from "auth/application/core/access/mcp";
import { mcpRequestSchema, mcpResultSchema } from "auth/application/schemas/mcp";
import { inputErrors as errors } from "auth/application/schemas/errors";

export const listMcpConnections = defineCapability({
    id: "list-mcp-connections",
    description: "List mcp connections",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/list-mcp-connections",
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
    execute: ({ input, services, context }) => executeMcp("list", input.requestJson, services, context),
});
