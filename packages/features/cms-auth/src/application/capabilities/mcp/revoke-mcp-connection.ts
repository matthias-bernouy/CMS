import { defineCapability } from "cms-auth/application/capabilities/define";
import { executeMcp } from "cms-auth/application/core/access/mcp";
import { mcpRequestSchema, mcpResultSchema } from "cms-auth/application/schemas/mcp";
import { inputErrors as errors } from "cms-auth/application/schemas/errors";

export const revokeMcpConnection = defineCapability({
    id: "revoke-mcp-connection",
    description: "Revoke mcp connection",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/revoke-mcp-connection",
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
    execute: ({ input, services, context }) => executeMcp("revoke", input.requestJson, services, context),
});
