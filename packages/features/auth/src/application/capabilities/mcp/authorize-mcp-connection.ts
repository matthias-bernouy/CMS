import { defineCapability } from "auth/application/capabilities/define";
import { executeMcp } from "auth/application/core/access/mcp";
import { mcpRequestSchema, mcpResultSchema } from "auth/application/schemas/mcp";
import { inputErrors as errors } from "auth/application/schemas/errors";

export const authorizeMcpConnection = defineCapability({
    id: "authorize-mcp-connection",
    description: "Authorize mcp connection",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/authorize-mcp-connection",
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
    execute: ({ input, services, context }) => executeMcp("authorize", input.requestJson, services, context),
});
