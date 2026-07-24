import {
    ANALYTICS_GOVERNANCE_ROUTES,
    ANALYTICS_ROUTES,
    ENDPOINT_PERFORMANCE_ROUTE,
    StrictAnalyticsReports,
    analyticsBreakdownHandler,
    analyticsComplianceHandler,
    analyticsEntriesHandler,
    analyticsFlowsHandler,
    analyticsHealthHandler,
    analyticsReferrersHandler,
    analyticsSettingsHandler,
    analyticsSummaryHandler,
    analyticsTimeseriesHandler,
    analyticsTopPagesHandler,
    createAnalyticsComplianceSnapshotHandler,
    endpointPerformanceHandler,
    updateAnalyticsSettingsHandler,
} from "@bernouy/cms-analytics";
import type { Runner } from "@bernouy/http-runner";
import type { ControlCmsState } from "cms-control/core/admin/control/types";

export function mountAnalyticsRoutes(runner: Runner, state: ControlCmsState): void {
    const endpointReports = state.configuration.endpointPerformanceReports;
    if (endpointReports) {
        runner.addEndpoint("GET", ENDPOINT_PERFORMANCE_ROUTE, (request) =>
            endpointPerformanceHandler(endpointReports, request),
        );
    }
    if (!state.analytics) {
        return;
    }
    const reports = new StrictAnalyticsReports(state.analytics);
    runner.addEndpoint("GET", ANALYTICS_ROUTES.summary, (request) => analyticsSummaryHandler(reports, request));
    runner.addEndpoint("GET", ANALYTICS_ROUTES.timeseries, (request) => analyticsTimeseriesHandler(reports, request));
    runner.addEndpoint("GET", ANALYTICS_ROUTES.topPages, (request) => analyticsTopPagesHandler(reports, request));
    runner.addEndpoint("GET", ANALYTICS_ROUTES.entries, (request) => analyticsEntriesHandler(reports, request));
    runner.addEndpoint("GET", ANALYTICS_ROUTES.breakdown, (request) => analyticsBreakdownHandler(reports, request));
    runner.addEndpoint("GET", ANALYTICS_ROUTES.referrers, (request) => analyticsReferrersHandler(reports, request));
    runner.addEndpoint("GET", ANALYTICS_ROUTES.flows, (request) => analyticsFlowsHandler(reports, request));
    runner.addEndpoint("GET", ANALYTICS_ROUTES.health, (request) => analyticsHealthHandler(reports, request));
    mountAnalyticsGovernance(runner, state);
}

function mountAnalyticsGovernance(runner: Runner, state: ControlCmsState): void {
    const analytics = state.analytics!;
    const compliance = state.configuration.analyticsCompliance ?? defaultComplianceContext(state);
    runner.addEndpoint("GET", ANALYTICS_GOVERNANCE_ROUTES.settings, () => analyticsSettingsHandler(analytics));
    runner.addEndpoint("POST", ANALYTICS_GOVERNANCE_ROUTES.settings, (request) =>
        updateAnalyticsSettingsHandler(analytics, request),
    );
    runner.addEndpoint("GET", ANALYTICS_GOVERNANCE_ROUTES.compliance, () =>
        analyticsComplianceHandler(analytics, compliance),
    );
    runner.addEndpoint("POST", ANALYTICS_GOVERNANCE_ROUTES.snapshots, (request) =>
        createAnalyticsComplianceSnapshotHandler(analytics, compliance, request),
    );
}

function defaultComplianceContext(state: ControlCmsState) {
    const delivery = safeUrl(state.configuration.deliveryUrl);
    return {
        cmsVersion: "development",
        secretReady: false,
        siteScope: delivery?.origin ?? "",
        trustProxy: false,
        trustedProxyVerified: false,
        secureCookie: delivery?.protocol === "https:",
        optOutUrl: delivery ? `${delivery.origin}/.cms/privacy/analytics` : "/.cms/privacy/analytics",
    };
}

function safeUrl(value: string | undefined): URL | undefined {
    try {
        return value ? new URL(value) : undefined;
    } catch {
        return;
    }
}
