import { ANALYTICS_VERSIONS, STRICT_ANALYTICS_LIMITS } from "../../interfaces/AnalyticsPrivacy";
import type {
    AnalyticsHealthSummary,
    AnalyticsStore,
    AnalyticsSummary,
    RangeQuery,
} from "../../interfaces/AnalyticsStore";
import { parseRange } from "./parseRange";
import {
    PUBLICATION_ROUNDING,
    publishCount,
    publishFlows,
    publishKeyCounts,
    publishTimeseries,
    roundCount,
    type Published,
} from "./publication";
import type { AnalyticsReport, AnalyticsReports, AnalyticsReportWindow } from "./types";

export class StrictAnalyticsReports implements AnalyticsReports {
    constructor(private readonly store: AnalyticsStore) {}

    async summary(window: AnalyticsReportWindow, now = new Date()) {
        await this.store.finalizeVisitors(now);
        return this.report(window, now, async (range) => {
            const latestDayTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const latestDayFrom = new Date(latestDayTo.getTime() - 86_400_000);
            const [summary, health, latestDay] = await Promise.all([
                this.store.summary(range.from, range.to),
                this.store.health(range.from, range.to),
                this.store.summary(latestDayFrom, latestDayTo),
            ]);
            return publishSummary(summary, health.requests, latestDay.estimatedVisitors, latestDayFrom);
        });
    }

    timeseries(window: AnalyticsReportWindow, now = new Date()) {
        return this.report(window, now, (range) => this.store.timeseries(range).then(publishTimeseries));
    }

    topPages(window: AnalyticsReportWindow, limit: number, now = new Date()) {
        return this.report(window, now, (range) =>
            this.store.topPages(range.from, range.to, 0).then((rows) => publishKeyCounts(rows, limit)),
        );
    }

    entries(window: AnalyticsReportWindow, limit: number, now = new Date()) {
        return this.report(window, now, (range) =>
            this.store.entries(range.from, range.to, 0).then((rows) => publishKeyCounts(rows, limit)),
        );
    }

    breakdown(
        dimension: "status" | "device" | "browser" | "exclusion" | "latency",
        window: AnalyticsReportWindow,
        now = new Date(),
    ) {
        return this.report(window, now, (range) =>
            this.store.breakdown(dimension, range.from, range.to).then((rows) => publishKeyCounts(rows, 0)),
        );
    }

    referrers(window: AnalyticsReportWindow, limit: number, now = new Date()) {
        return this.report(window, now, (range) =>
            this.store.topReferrers(range.from, range.to, 0).then((rows) => publishKeyCounts(rows, limit)),
        );
    }

    flows(window: AnalyticsReportWindow, limit: number, now = new Date()) {
        return this.report(window, now, (range) =>
            this.store.flows(range.from, range.to, 100).then((rows) => publishFlows(rows, limit)),
        );
    }

    health(window: AnalyticsReportWindow, now = new Date()) {
        return this.report(window, now, async (range) => publishHealth(await this.store.health(range.from, range.to)));
    }

    private async report<T>(
        window: AnalyticsReportWindow,
        now: Date,
        load: (range: RangeQuery) => Promise<Published<T>>,
    ): Promise<AnalyticsReport<T>> {
        const range = parseRange(window, now);
        const [published, referrerSaturated] = await Promise.all([
            load(range),
            this.store.referrerSaturated(range.from, range.to),
        ]);
        return {
            data: published.data,
            meta: {
                profile: "privacy-strict",
                window,
                from: range.from,
                to: range.to,
                lastClosedBucket: range.to,
                threshold: STRICT_ANALYTICS_LIMITS.publicationThreshold,
                rounding: PUBLICATION_ROUNDING,
                suppressedValueCount: published.suppressed,
                referrerSaturated,
                versions: {
                    filter: ANALYTICS_VERSIONS.filter,
                    rollup: ANALYTICS_VERSIONS.rollup,
                    visitorEstimator: ANALYTICS_VERSIONS.visitorEstimator,
                    publication: ANALYTICS_VERSIONS.publication,
                },
            },
        };
    }
}

function publishSummary(
    summary: AnalyticsSummary,
    healthRequests: number,
    latestDayVisitors: number,
    latestCompletedUtcDay: Date,
) {
    const views = publishCount(summary.views);
    const visitors = publishCount(summary.estimatedVisitors);
    const latestDay = publishCount(latestDayVisitors);
    const canPublishViews = summary.views >= STRICT_ANALYTICS_LIMITS.publicationThreshold;
    const canPublishHealth = healthRequests >= STRICT_ANALYTICS_LIMITS.publicationThreshold;
    return {
        data: {
            views: views.data,
            estimatedVisitors: visitors.data,
            uniqueVisitors: visitors.data,
            visitorDays: visitors.data,
            averageDailyVisitors: visitors.data ? roundCount(summary.averageDailyVisitors) : 0,
            latestCompletedDayVisitors: latestDay.data,
            latestCompletedUtcDay,
            avgMs: canPublishViews && summary.avgMs !== null ? roundCount(summary.avgMs) : null,
            errorRate: canPublishHealth && summary.errorRate !== null ? roundRate(summary.errorRate) : null,
        },
        suppressed:
            views.suppressed +
            visitors.suppressed +
            latestDay.suppressed +
            (canPublishViews ? 0 : 1) +
            (canPublishHealth ? 0 : 1),
    };
}

function publishHealth(health: AnalyticsHealthSummary): Published<AnalyticsHealthSummary> {
    const fields = [health.requests, health.notFound, health.clientErrors, health.serverErrors].map(publishCount);
    const publishLatency = health.requests >= STRICT_ANALYTICS_LIMITS.publicationThreshold;
    return {
        data: {
            requests: fields[0]!.data,
            notFound: fields[1]!.data,
            clientErrors: fields[2]!.data,
            serverErrors: fields[3]!.data,
            avgMs: publishLatency && health.avgMs !== null ? roundCount(health.avgMs) : null,
            maxMs: publishLatency && health.maxMs !== null ? roundCount(health.maxMs) : null,
        },
        suppressed: fields.reduce((sum, field) => sum + field.suppressed, publishLatency ? 0 : 2),
    };
}

function roundRate(value: number): number {
    return Math.round(value * 100) / 100;
}
