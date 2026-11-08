import { defineCapability } from "auth/application/capabilities/define";
import { executeMcp } from "auth/application/core/access/mcp";
import { mcpRequestSchema, mcpResultSchema } from "auth/application/schemas/mcp";
import { inputErrors as errors } from "auth/application/schemas/errors";

export const prepareMcpAuthorization = defineCapability({
    id: "prepare-mcp-authorization",
    description: "Prepare mcp authorization",
    access: "public",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/prepare-mcp-authorization",
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
    execute: ({ input, services, context }) => executeMcp("prepare", input.requestJson, services, context),
});
