import { defineCapability } from "cms-observability/capabilities/define";
import { getErrors as errors } from "cms-observability/schemas/errors";
import { getLogsInputSchema } from "cms-observability/schemas/queries";
import { logDetailSchema } from "cms-observability/schemas/entries";
export const getLogs = defineCapability({
    id: "logs.get",
    description: "Read one retained log entry in the authenticated instance.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/observability/logs/get",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503, NOT_FOUND: 404 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "observability_logs_get",
                description:
                    "Read one retained log entry from this instance using an exact id returned by observability_logs_query. Returns bounded attributes and sanitized error details.",
            },
        },
    ],
    docs: ["overview.md"],
    input: getLogsInputSchema,
    output: logDetailSchema,
    errors,
    execute: ({ input, services }) => services.observability.get(input),
});
