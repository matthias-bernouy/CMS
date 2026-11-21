import { latencyInputSchema, latencyOutputSchema } from "observability/cluster/schemas/latency";
import { authorize, defineCapability, errors, response } from "./shared";

export const queryClusterLatency = defineCapability({
    id: "latency.query",
    access: "admin",
    description:
        "Aggregate existing durations for one exact event and service; merge histograms before computing bounded approximate percentiles.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: latencyInputSchema,
    output: latencyOutputSchema,
    errors,
    docs: ["overview.md"],
    authorize,
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/ulvia/operator/logs/latency",
            input: { body: true },
            response,
        },
    ],
    execute: ({ input, services }) => services.clusterLogs.latency(input),
});
