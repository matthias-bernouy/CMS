/**
 * @bernouy/cms-analytics — server-side, privacy-first web analytics.
 * Public surface: the event contract and the store interface (read + write).
 */

export type {
    AnalyticsBrowser,
    AnalyticsDevice,
    AnalyticsEvent,
    AnalyticsEventType,
    AnalyticsExclusionReason,
} from "../interfaces/AnalyticsEvent";
export type {
    AnalyticsStore,
    AnalyticsSummary,
    TimeBucket,
    KeyCount,
    FlowCount,
    RangeQuery,
    AnalyticsHealthSummary,
    AnalyticsStoreConfig,
} from "../interfaces/AnalyticsStore";
export type { AnalyticsCollectionPolicy } from "../interfaces/AnalyticsPolicy";
export type {
    AnalyticsComplianceContext,
    AnalyticsComplianceCriterion,
    AnalyticsComplianceEvaluation,
    AnalyticsComplianceSnapshot,
    AnalyticsCriterionStatus,
    AnalyticsManualAttestation,
    AnalyticsSettings,
} from "../interfaces/AnalyticsGovernance";
export { DEFAULT_ANALYTICS_COLLECTION_POLICY } from "../interfaces/AnalyticsPolicy";
export type { AnalyticsPrivacyProfile } from "../interfaces/AnalyticsPrivacy";
export {
    ANALYTICS_VERSIONS,
    STRICT_ANALYTICS_LIMITS,
    assertSupportedAnalyticsProfile,
} from "../interfaces/AnalyticsPrivacy";
export { StrictAnalyticsReports } from "../core/reporting/StrictAnalyticsReports";
export {
    ANALYTICS_CHECKLIST_VERSION,
    evaluateAnalyticsCompliance,
} from "../core/governance/evaluateCompliance";
export { startAnalyticsFinalizer, type AnalyticsFinalizer } from "../core/hll/AnalyticsFinalizer";
export type {
    AnalyticsReport,
    AnalyticsReportMetadata,
    AnalyticsReportSummary,
    AnalyticsReports,
    AnalyticsReportWindow,
} from "../core/reporting/types";
export {
    ENDPOINT_PERFORMANCE_METHODS,
    ENDPOINT_PERFORMANCE_RANGES,
    ENDPOINT_PERFORMANCE_SORTS,
    ENDPOINT_PERFORMANCE_STATUS_CLASSES,
    ENDPOINT_PERFORMANCE_SURFACES,
    ENDPOINT_PERFORMANCE_UNRESOLVED,
    ENDPOINT_TIMING_STAGES,
} from "../interfaces/EndpointPerformance";
export type {
    EndpointPerformanceMethod,
    EndpointPerformanceObservation,
    EndpointPerformanceOutcome,
    EndpointPerformanceQuery,
    EndpointPerformanceRange,
    EndpointPerformanceRecorder,
    EndpointPerformanceReports,
    EndpointPerformanceSort,
    EndpointPerformanceStatusClass,
    EndpointPerformanceSurface,
    EndpointTimingStage,
} from "../interfaces/EndpointPerformance";
export type {
    EndpointLatencySummary,
    EndpointPerformanceDashboard,
    EndpointPerformanceDetail,
    EndpointPerformanceHistogramBucket,
    EndpointPerformanceMetadata,
    EndpointPerformanceRow,
    EndpointPerformanceStageSummary,
    EndpointPerformanceTimelinePoint,
    EndpointRequestSummary,
} from "../interfaces/EndpointPerformanceDashboard";
export {
    BufferedEndpointPerformanceRecorder,
    type BufferedEndpointPerformanceRecorderConfig,
    type BufferedEndpointPerformanceStats,
} from "../core/rollups/endpoint-performance/BufferedEndpointPerformanceRecorder";
export {
    startEndpointPerformanceFlusher,
    type EndpointPerformanceFlusher,
} from "../core/rollups/endpoint-performance/flusher";
export { ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS } from "../core/rollups/endpoint-performance/histogram";

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
    analyticsEntriesHandler,
    analyticsBreakdownHandler,
    analyticsReferrersHandler,
    analyticsFlowsHandler,
    analyticsHealthHandler,
} from "../http/analyticsHandlers";
export {
    ANALYTICS_GOVERNANCE_ROUTES,
    analyticsComplianceHandler,
    analyticsSettingsHandler,
    createAnalyticsComplianceSnapshotHandler,
    updateAnalyticsSettingsHandler,
} from "../http/governanceHandlers";
export {
    buildPageViewEvent,
    type BuildPageViewEventOptions,
} from "../core/collection/buildPageViewEvent";
