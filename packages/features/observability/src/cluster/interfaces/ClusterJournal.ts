import type { z } from "zod";
import type { LogDetail, LogSummary, NormalizedLogQuery } from "observability/interfaces/Journal";
import type {
    clusterQueryInputSchema,
    clusterAggregateInputSchema,
    clusterGetInputSchema,
    sourceSchema,
} from "observability/cluster/schemas/logs";
import type { latencyInputSchema } from "observability/cluster/schemas/latency";
export type ClusterQuery = z.infer<typeof clusterQueryInputSchema>;
export type ClusterAggregate = z.infer<typeof clusterAggregateInputSchema>;
export type ClusterGet = z.infer<typeof clusterGetInputSchema>;
export type LatencyQuery = z.infer<typeof latencyInputSchema>;
export type ClusterSource = z.infer<typeof sourceSchema>;
export interface ClusterPosition {
    readonly instanceId: string;
    readonly receivedAt: string;
    readonly id: string;
}
export interface LatencyHistogram {
    readonly bucket: number;
    readonly key: string;
    readonly count: number;
    readonly sum: number;
    readonly min: number;
    readonly max: number;
    readonly bins: readonly { index: number; count: number }[];
}
export interface ClusterJournalReader {
    query(query: NormalizedLogQuery, now: string, after?: ClusterPosition): Promise<readonly LogSummary[]>;
    get(id: string, now: string): Promise<LogDetail | null>;
    aggregate(
        query: NormalizedLogQuery,
        groupBy: ClusterAggregate["groupBy"],
        now: string,
    ): Promise<{
        total: number;
        groups: readonly { key: string; count: number }[];
    }>;
    latency(
        query: NormalizedLogQuery,
        groupBy: LatencyQuery["groupBy"],
        intervalSeconds: number,
        now: string,
    ): Promise<readonly LatencyHistogram[]>;
}
export interface ClusterJournalDirectory {
    open(instanceId: string): Promise<ClusterJournalReader>;
}
