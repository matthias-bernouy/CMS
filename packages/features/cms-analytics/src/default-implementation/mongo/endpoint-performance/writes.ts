import type { AnyBulkWriteOperation } from "mongodb";
import { endpointPerformanceBinField } from "../../../core/rollups/endpoint-performance/histogram";
import {
    ENDPOINT_PERFORMANCE_BUCKET_MS,
    ENDPOINT_PERFORMANCE_RETENTION_DAYS,
} from "../../../core/rollups/endpoint-performance/normalization";
import type {
    EndpointPerformanceAggregate,
    EndpointPerformanceBatch,
    EndpointPerformanceCollectorAggregate,
} from "../../../core/rollups/endpoint-performance/types";
import type { EndpointPerformanceDoc } from "./types";

export const ENDPOINT_PERFORMANCE_ROLLUP_VERSION = "endpoint-performance-v1";

export function endpointPerformanceWriteOperations(
    batch: EndpointPerformanceBatch,
    retentionDays = ENDPOINT_PERFORMANCE_RETENTION_DAYS,
): Array<AnyBulkWriteOperation<EndpointPerformanceDoc>> {
    return [
        ...batch.rollups.map((aggregate) => endpointOperation(aggregate, retentionDays)),
        ...batch.collectors.map((aggregate) => collectorOperation(aggregate, retentionDays)),
    ];
}

function endpointOperation(
    aggregate: EndpointPerformanceAggregate,
    retentionDays: number,
): AnyBulkWriteOperation<EndpointPerformanceDoc> {
    const increment: Record<string, number> = {
        requestCount: aggregate.requestCount,
        errorCount: aggregate.errorCount,
    };
    const maximum: Record<string, number | Date> = { lastObservedAt: aggregate.lastObservedAt };
    for (const [stage, summary] of Object.entries(aggregate.stages)) {
        if (!summary) {
            continue;
        }
        increment[`stages.${stage}.count`] = summary.count;
        increment[`stages.${stage}.sumMs`] = summary.sumMs;
        maximum[`stages.${stage}.maxMs`] = summary.maxMs;
        summary.histogram.forEach((count, index) => {
            if (count > 0) {
                increment[`stages.${stage}.bins.${endpointPerformanceBinField(index)}`] = count;
            }
        });
    }
    return {
        updateOne: {
            filter: { _id: endpointDocumentId(aggregate) },
            update: {
                $inc: increment,
                $min: { firstObservedAt: aggregate.firstObservedAt },
                $max: maximum,
                $setOnInsert: {
                    kind: "endpoint",
                    bucket: aggregate.bucket,
                    surface: aggregate.surface,
                    endpointUrn: aggregate.endpointUrn,
                    method: aggregate.method,
                    statusClass: aggregate.statusClass,
                    outcome: aggregate.outcome,
                    expiresAt: expiry(aggregate.bucket, retentionDays),
                    rollupVersion: ENDPOINT_PERFORMANCE_ROLLUP_VERSION,
                },
            },
            upsert: true,
        },
    };
}

function collectorOperation(
    aggregate: EndpointPerformanceCollectorAggregate,
    retentionDays: number,
): AnyBulkWriteOperation<EndpointPerformanceDoc> {
    return {
        updateOne: {
            filter: { _id: collectorDocumentId(aggregate.bucket) },
            update: {
                $inc: {
                    accepted: aggregate.accepted,
                    dropped: aggregate.dropped,
                    invalid: aggregate.invalid,
                    flushFailures: aggregate.flushFailures,
                },
                $max: { lastFlushAt: aggregate.lastFlushAt },
                $setOnInsert: {
                    kind: "collector",
                    bucket: aggregate.bucket,
                    expiresAt: expiry(aggregate.bucket, retentionDays),
                    rollupVersion: ENDPOINT_PERFORMANCE_ROLLUP_VERSION,
                },
            },
            upsert: true,
        },
    };
}

function endpointDocumentId(aggregate: EndpointPerformanceAggregate): string {
    return JSON.stringify([
        ENDPOINT_PERFORMANCE_ROLLUP_VERSION,
        aggregate.bucket.toISOString(),
        aggregate.surface,
        aggregate.endpointUrn,
        aggregate.method,
        aggregate.statusClass,
    ]);
}

function collectorDocumentId(bucket: Date): string {
    return JSON.stringify([ENDPOINT_PERFORMANCE_ROLLUP_VERSION, "collector", bucket.toISOString()]);
}

function expiry(bucket: Date, retentionDays: number): Date {
    return new Date(bucket.getTime() + retentionDays * 86_400_000 + ENDPOINT_PERFORMANCE_BUCKET_MS);
}
