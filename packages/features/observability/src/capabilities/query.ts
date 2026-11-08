import { defineCapability } from "observability/capabilities/define";
import { queryErrors as errors } from "observability/schemas/errors";
import { queryLogsInputSchema, queryLogsOutputSchema } from "observability/schemas/queries";
export const queryLogs = defineCapability({
    id: "logs.query",
    description:
        "Search retained logs on the server. The default time window is the previous 24 hours; cursors are scoped to the same filters and instance.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/observability/logs/query",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503, INVALID_CURSOR: 422 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "observability_logs_query",
                description:
                    "Search this instance’s retained application logs. Narrow the time window, level, service, event or trace before reading. Follow nextCursor with the same filters; use observability_logs_get for entry details.",
            },
        },
    ],
    docs: ["overview.md"],
    input: queryLogsInputSchema,
    output: queryLogsOutputSchema,
    errors,
    execute: ({ input, services }) => services.observability.query(input),
});
