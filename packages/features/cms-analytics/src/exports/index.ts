/**
 * @bernouy/cms-analytics — server-side, privacy-first web analytics.
 * Public surface: the event contract and the store interface (read + write).
 */

export type { AnalyticsEvent, AnalyticsEventType } from "../interfaces/AnalyticsEvent";
export type {
    AnalyticsStore,
    AnalyticsSummary,
    TimeBucket,
    KeyCount,
    RangeQuery,
} from "../interfaces/AnalyticsStore";

// ── Default implementations (instantiated in the composition root) ──
export { InMemoryAnalyticsStore } from "../default-implementation/InMemoryAnalyticsStore";
export {
    ValidatingAnalyticsStore,
    validateAnalyticsEvent,
    AnalyticsValidationError,
} from "../core/ValidatingAnalyticsStore";

// ── HTTP API (mount in an app's admin-guarded group) ──
export {
    ANALYTICS_ROUTES,
    analyticsSummaryHandler,
    analyticsTimeseriesHandler,
    analyticsTopPagesHandler,
    analyticsBreakdownHandler,
} from "../http/analyticsHandlers";
export { buildPageViewEvent } from "../core/buildPageViewEvent";
