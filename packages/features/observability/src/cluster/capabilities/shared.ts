import { capabilitiesFor, contractString, z } from "@bernouy/ulvia-sdk";
import type { ClusterLogs } from "observability/cluster/core/ClusterLogs";
import { ClusterLogsError } from "observability/cluster/core/errors";

export const CLUSTER_LOGS_CONTRACT_ID = "ulvia/cluster.logs";
export const CLUSTER_LOGS_SITE_ID = "cluster-logs";
export const CLUSTER_LOGS_INSTANCE_ID = "instance:cluster-logs";
export const CLUSTER_OPERATOR_SERVICE = "cluster-operator";
export interface ClusterLogsServices {
    readonly clusterLogs: Pick<ClusterLogs, "query" | "get" | "aggregate" | "latency">;
}
export const defineCapability = capabilitiesFor<ClusterLogsServices>();
const message = z.strictObject({ message: contractString({ maxLength: 256 }) });
export const errors = {
    INVALID_INPUT: { retryable: false, output: message },
    INVALID_CURSOR: { retryable: false, output: message },
    FORBIDDEN: { retryable: false, output: message },
    NOT_FOUND: { retryable: false, output: message },
    QUERY_TOO_LARGE: { retryable: false, output: message },
    CORE_UNAVAILABLE: { retryable: true, output: message },
};
export const response = {
    successStatuses: [200],
    contentTypes: ["application/json"],
    errorStatuses: {
        INVALID_INPUT: 422,
        INVALID_CURSOR: 422,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        QUERY_TOO_LARGE: 422,
        CORE_UNAVAILABLE: 503,
    },
};
export const authorize: NonNullable<Parameters<typeof defineCapability>[0]["authorize"]> = ({ context }) => {
    if (
        context.siteId !== CLUSTER_LOGS_SITE_ID ||
        context.invocation?.instanceId !== CLUSTER_LOGS_INSTANCE_ID ||
        context.invocation.contractId !== CLUSTER_LOGS_CONTRACT_ID ||
        context.systemServiceId !== CLUSTER_OPERATOR_SERVICE ||
        context.subjectId ||
        context.sourceInstallationId ||
        context.controlAuthority ||
        context.connectionId
    ) {
        throw new ClusterLogsError("FORBIDDEN");
    }
};
