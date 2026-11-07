import { defineCapability } from "cms-observability/capabilities/define";
import { aggregateErrors as errors } from "cms-observability/schemas/errors";
import { aggregateLogsInputSchema, aggregateLogsOutputSchema } from "cms-observability/schemas/queries";
export const aggregateLogs = defineCapability({
    id: "logs.aggregate",
    description:
        "Count retained diagnostic records by one predefined dimension. These counts are not request-rate or performance metrics.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/observability/logs/aggregate",
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
                name: "observability_logs_aggregate",
                description:
                    "Count this instance’s retained logs by one supported dimension and bounded filters. Use for diagnostic summaries; these counts are not request rates or latency metrics.",
            },
        },
    ],
    docs: ["overview.md"],
    input: aggregateLogsInputSchema,
    output: aggregateLogsOutputSchema,
    errors,
    execute: ({ input, services }) => services.observability.aggregate(input),
});
