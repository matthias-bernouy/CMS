import type { Collection, Db } from "mongodb";
import type { EndpointPerformanceQuery, EndpointPerformanceReports } from "../../../interfaces/EndpointPerformance";
import type { EndpointPerformanceBatchWriter } from "../../../core/rollups/endpoint-performance/types";
import { ENDPOINT_PERFORMANCE_RETENTION_DAYS } from "../../../core/rollups/endpoint-performance/normalization";
import { readEndpointPerformanceDashboard } from "./readDashboard";
import type { EndpointPerformanceDoc } from "./types";
import { endpointPerformanceWriteOperations } from "./writes";

export type MongoEndpointPerformanceStoreConfig = {
    collectionPrefix?: string;
    retentionDays?: number;
};

export class MongoEndpointPerformanceStore implements EndpointPerformanceBatchWriter, EndpointPerformanceReports {
    private readonly collectionPrefix: string;
    private readonly retentionDays: number;

    constructor(
        private readonly db: Db,
        config: MongoEndpointPerformanceStoreConfig = {},
    ) {
        this.collectionPrefix = config.collectionPrefix ?? "";
        this.retentionDays = validRetentionDays(config.retentionDays);
    }

    private get rollups(): Collection<EndpointPerformanceDoc> {
        return this.db.collection<EndpointPerformanceDoc>(
            `${this.collectionPrefix}analytics_source_performance_rollups`,
        );
    }

    async init(): Promise<void> {
        await Promise.all([
            this.rollups.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
            this.rollups.createIndex({
                kind: 1,
                bucket: 1,
                surface: 1,
                endpointUrn: 1,
                method: 1,
                statusClass: 1,
            }),
        ]);
    }

    async write(batch: Parameters<EndpointPerformanceBatchWriter["write"]>[0]): Promise<void> {
        const operations = endpointPerformanceWriteOperations(batch, this.retentionDays);
        if (operations.length > 0) {
            await this.rollups.bulkWrite(operations, { ordered: false });
        }
    }

    dashboard(query: EndpointPerformanceQuery, now = new Date()) {
        return readEndpointPerformanceDashboard(this.rollups, query, now);
    }
}

function validRetentionDays(value: number | undefined): number {
    return Number.isSafeInteger(value) && value! >= 1 && value! <= 90 ? value! : ENDPOINT_PERFORMANCE_RETENTION_DAYS;
}
