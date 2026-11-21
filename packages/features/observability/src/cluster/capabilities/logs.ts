import {
    clusterQueryInputSchema,
    clusterQueryOutputSchema,
    clusterGetInputSchema,
    clusterGetOutputSchema,
    clusterAggregateInputSchema,
    clusterAggregateOutputSchema,
} from "observability/cluster/schemas/logs";
import { authorize, defineCapability, errors, response } from "./shared";

export const queryClusterLogs = defineCapability({
    id: "logs.query",
    access: "admin",
    description: "Search retained instance journals with bounded global pagination and explicit source coverage.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: clusterQueryInputSchema,
    output: clusterQueryOutputSchema,
    errors,
    docs: ["overview.md"],
    authorize,
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/ulvia/operator/logs/query",
            input: { body: true },
            response,
        },
    ],
    execute: ({ input, services }) => services.clusterLogs.query(input),
});
export const getClusterLog = defineCapability({
    id: "logs.get",
    access: "admin",
    description: "Read one retained diagnostic using its exact instance and entry IDs.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: clusterGetInputSchema,
    output: clusterGetOutputSchema,
    errors,
    docs: ["overview.md"],
    authorize,
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/ulvia/operator/logs/get",
            input: { body: true },
            response,
        },
    ],
    execute: ({ input, services }) => services.clusterLogs.get(input),
});
export const aggregateClusterLogs = defineCapability({
    id: "logs.aggregate",
    access: "admin",
    description: "Count retained logs across selected instances; these counts are not request rates.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: clusterAggregateInputSchema,
    output: clusterAggregateOutputSchema,
    errors,
    docs: ["overview.md"],
    authorize,
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/ulvia/operator/logs/aggregate",
            input: { body: true },
            response,
        },
    ],
    execute: ({ input, services }) => services.clusterLogs.aggregate(input),
});
