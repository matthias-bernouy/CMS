/**
 * @bernouy/cms-analytics — server-side, privacy-first web analytics.
 * Public surface: the event contract and the store interface (read + write).
 */

export type { AnalyticsEvent, AnalyticsEventType } from "./interfaces/AnalyticsEvent";
export type {
    AnalyticsStore,
    AnalyticsSummary,
    TimeBucket,
    KeyCount,
    RangeQuery,
} from "./interfaces/AnalyticsStore";

// ── Core (pure logic) — helpers the delivery collector uses to build events ──
export { classifyUserAgent } from "./core/userAgent";
export type { UserAgentClass } from "./core/userAgent";
export { dailySalt, visitorId } from "./core/visitor";
export { dayKey } from "./core/buckets";

// ── Default implementations (instantiated in the composition root) ──
export { InMemoryAnalyticsStore } from "./default-implementation/AnalyticsStore/memory";
export { MongoAnalyticsStore, type MongoAnalyticsStoreConfig } from "./default-implementation/AnalyticsStore/mongodb";
