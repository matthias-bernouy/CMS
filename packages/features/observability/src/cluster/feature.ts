import { defineFeature } from "@bernouy/ulvia-sdk";
import { ObservabilityError } from "observability/core/validation";
import { ClusterLogsError } from "./core/errors";
import { queryClusterLogs, getClusterLog, aggregateClusterLogs } from "./capabilities/logs";
import { queryClusterLatency } from "./capabilities/latency";
import { CLUSTER_LOGS_CONTRACT_ID } from "./capabilities/shared";

export const clusterLogsFeature = defineFeature({
    contractId: CLUSTER_LOGS_CONTRACT_ID,
    version: "1.0.0",
    publisherId: "ulvia",
    name: "Cluster Logs",
    description:
        "Operator-only federation of existing instance journals and their recorded durations; no ingestion or new telemetry.",
    catalogue: { icon: "activity", categories: ["infrastructure", "observability"] },
    documents: new URL("./docs/", import.meta.url),
    capabilities: [queryClusterLogs, getClusterLog, aggregateClusterLogs, queryClusterLatency],
    mapError: (cause) => ({
        code:
            cause instanceof ClusterLogsError
                ? cause.code
                : cause instanceof ObservabilityError && cause.code === "INVALID_INPUT"
                  ? "INVALID_INPUT"
                  : "CORE_UNAVAILABLE",
        output: { message: "The cluster journal request could not be completed." },
    }),
});
export {
    CLUSTER_LOGS_CONTRACT_ID,
    CLUSTER_LOGS_SITE_ID,
    CLUSTER_LOGS_INSTANCE_ID,
    CLUSTER_OPERATOR_SERVICE,
} from "./capabilities/shared";
export type { ClusterLogsServices } from "./capabilities/shared";
