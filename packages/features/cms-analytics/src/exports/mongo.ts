/**
 * Mongo adapter of @bernouy/cms-analytics — imported by composition roots only,
 * never by surfaces or libs that just consume the `AnalyticsStore` contract.
 */

export { MongoAnalyticsStore, type MongoAnalyticsStoreConfig } from "../default-implementation/MongoAnalyticsStore";
export {
    migrateLegacyAnalytics,
    type AnalyticsMigrationResult,
} from "../default-implementation/mongo/migrateLegacyAnalytics";
export {
    MongoEndpointPerformanceStore,
    type MongoEndpointPerformanceStoreConfig,
} from "../default-implementation/mongo/endpoint-performance/MongoEndpointPerformanceStore";
