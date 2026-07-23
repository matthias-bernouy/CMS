import type {
    AnalyticsHealthSummary,
    AnalyticsReport,
    AnalyticsReportMetadata,
    AnalyticsReportSummary,
    FlowCount,
    KeyCount,
    TimeBucket,
} from "@bernouy/cms-analytics";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

export const ANALYTICS_VIEWS = ["overview", "content", "origins", "health"] as const;
export const ANALYTICS_NAV_VIEWS = [...ANALYTICS_VIEWS, "endpoints"] as const;
export type AnalyticsView = (typeof ANALYTICS_VIEWS)[number];
export type AnalyticsNavView = (typeof ANALYTICS_NAV_VIEWS)[number];
export type AnalyticsRange = "24h" | "7d" | "30d";
export type AnalyticsTimeBucket = Omit<TimeBucket, "bucket"> & { bucket: string };
export type AnalyticsSummaryView = Omit<AnalyticsReportSummary, "latestCompletedUtcDay"> & {
    latestCompletedUtcDay: string;
};
export type AnalyticsReportMetaView = Omit<AnalyticsReportMetadata, "from" | "to" | "lastClosedBucket"> & {
    from: string;
    to: string;
    lastClosedBucket: string;
};

export type AnalyticsDashboardData =
    | {
          view: "overview";
          meta: AnalyticsReportMetaView;
          summary: AnalyticsSummaryView;
          timeseries: AnalyticsTimeBucket[];
          devices: KeyCount[];
          browsers: KeyCount[];
      }
    | {
          view: "content";
          meta: AnalyticsReportMetaView;
          pages: KeyCount[];
          entries: KeyCount[];
          flows: FlowCount[];
      }
    | {
          view: "origins";
          meta: AnalyticsReportMetaView;
          referrers: KeyCount[];
      }
    | {
          view: "health";
          meta: AnalyticsReportMetaView;
          health: AnalyticsHealthSummary;
          statuses: KeyCount[];
          latency: KeyCount[];
          exclusions: KeyCount[];
      };

export function currentAnalyticsRange(search = window.location.search): AnalyticsRange {
    const range = new URLSearchParams(search).get("range");
    return range === "24h" || range === "30d" ? range : "7d";
}

export function analyticsRangeLabel(range: AnalyticsRange): string {
    return range === "24h" ? "Last 24 hours" : range === "30d" ? "Last 30 days" : "Last 7 days";
}

export function analyticsViewPath(view: AnalyticsNavView): string {
    const suffix = view === "overview" ? "" : `/${view}`;
    return `${getMetaBasePath()}/admin/analytics${suffix}`;
}

export function analyticsViewFromPath(pathname: string, basePath = getMetaBasePath()): AnalyticsNavView {
    const localPath = basePath && pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
    const section = localPath.match(/^\/admin\/analytics\/([^/]+)\/?$/)?.[1] ?? "";
    return isAnalyticsNavView(section) && section !== "overview" ? section : "overview";
}

export async function fetchAnalyticsDashboard(
    view: AnalyticsView,
    range: AnalyticsRange,
    signal?: AbortSignal,
): Promise<AnalyticsDashboardData> {
    if (view === "overview") {
        const [summary, timeseries, devices, browsers] = await Promise.all([
            getReport<AnalyticsSummaryView>("summary", range, signal),
            getReport<AnalyticsTimeBucket[]>("timeseries", range, signal),
            getReport<KeyCount[]>("breakdown", range, signal, undefined, "device"),
            getReport<KeyCount[]>("breakdown", range, signal, undefined, "browser"),
        ]);
        return {
            view,
            meta: summary.meta,
            summary: summary.data,
            timeseries: timeseries.data,
            devices: devices.data,
            browsers: browsers.data,
        };
    }
    if (view === "content") {
        const [pages, entries, flows] = await Promise.all([
            getReport<KeyCount[]>("top-pages", range, signal, 10),
            getReport<KeyCount[]>("entries", range, signal, 10),
            getReport<FlowCount[]>("flows", range, signal, 10),
        ]);
        return { view, meta: pages.meta, pages: pages.data, entries: entries.data, flows: flows.data };
    }
    if (view === "origins") {
        const referrers = await getReport<KeyCount[]>("referrers", range, signal, 10);
        return { view, meta: referrers.meta, referrers: referrers.data };
    }
    const [health, statuses, latency, exclusions] = await Promise.all([
        getReport<AnalyticsHealthSummary>("health", range, signal),
        getReport<KeyCount[]>("breakdown", range, signal, undefined, "status"),
        getReport<KeyCount[]>("breakdown", range, signal, undefined, "latency"),
        getReport<KeyCount[]>("breakdown", range, signal, undefined, "exclusion"),
    ]);
    return {
        view,
        meta: health.meta,
        health: health.data,
        statuses: statuses.data,
        latency: latency.data,
        exclusions: exclusions.data,
    };
}

function isAnalyticsNavView(value: string): value is AnalyticsNavView {
    return ANALYTICS_NAV_VIEWS.includes(value as AnalyticsNavView);
}

async function getReport<T>(
    endpoint: string,
    range: AnalyticsRange,
    signal?: AbortSignal,
    limit?: number,
    dimension?: string,
): Promise<{ data: T; meta: AnalyticsReportMetaView }> {
    const params = new URLSearchParams({ range });
    if (limit) {
        params.set("limit", String(limit));
    }
    if (dimension) {
        params.set("dim", dimension);
    }
    const response = await fetch(`${getMetaBasePath()}/api/analytics/${endpoint}?${params}`, {
        headers: { Accept: "application/json" },
        signal,
    });
    if (!response.ok) {
        throw new Error(`Analytics request failed with status ${response.status}`);
    }
    return (await response.json()) as AnalyticsReport<T> as unknown as {
        data: T;
        meta: AnalyticsReportMetaView;
    };
}
