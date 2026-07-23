import type { AnalyticsHealthSummary, AnalyticsSummary, FlowCount, KeyCount, TimeBucket } from "@bernouy/cms-analytics";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

export const ANALYTICS_VIEWS = ["overview", "content", "acquisition", "health"] as const;
export type AnalyticsView = (typeof ANALYTICS_VIEWS)[number];
export type AnalyticsRange = "24h" | "7d" | "30d";
export type AnalyticsTimeBucket = Omit<TimeBucket, "bucket"> & { bucket: string };

export type AnalyticsDashboardData =
    | {
          view: "overview";
          summary: AnalyticsSummary;
          timeseries: AnalyticsTimeBucket[];
      }
    | {
          view: "content";
          pages: KeyCount[];
          flows: FlowCount[];
          devices: KeyCount[];
          browsers: KeyCount[];
      }
    | {
          view: "acquisition";
          channels: KeyCount[];
          referrers: KeyCount[];
      }
    | {
          view: "health";
          health: AnalyticsHealthSummary;
          statuses: KeyCount[];
      };

export function currentAnalyticsRange(search = window.location.search): AnalyticsRange {
    const range = new URLSearchParams(search).get("range");
    return range === "24h" || range === "30d" ? range : "7d";
}

export function analyticsRangeLabel(range: AnalyticsRange): string {
    return range === "24h" ? "Last 24 hours" : range === "30d" ? "Last 30 days" : "Last 7 days";
}

export function analyticsViewPath(view: AnalyticsView): string {
    const suffix = view === "overview" ? "" : `/${view}`;
    return `${getMetaBasePath()}/admin/analytics${suffix}`;
}

export function analyticsViewFromPath(pathname: string, basePath = getMetaBasePath()): AnalyticsView {
    const localPath = basePath && pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
    const section = localPath.match(/^\/admin\/analytics\/([^/]+)\/?$/)?.[1] ?? "";
    return isAnalyticsView(section) && section !== "overview" ? section : "overview";
}

export async function fetchAnalyticsDashboard(
    view: AnalyticsView,
    range: AnalyticsRange,
    signal?: AbortSignal,
): Promise<AnalyticsDashboardData> {
    if (view === "overview") {
        const [summary, timeseries] = await Promise.all([
            getJson<AnalyticsSummary>("summary", range, signal),
            getJson<AnalyticsTimeBucket[]>("timeseries", range, signal),
        ]);
        return { view, summary, timeseries };
    }
    if (view === "content") {
        const [pages, flows, devices, browsers] = await Promise.all([
            getJson<KeyCount[]>("top-pages", range, signal, 10),
            getJson<FlowCount[]>("flows", range, signal, 10),
            getJson<KeyCount[]>("breakdown", range, signal, undefined, "device"),
            getJson<KeyCount[]>("breakdown", range, signal, undefined, "browser"),
        ]);
        return { view, pages, flows, devices, browsers };
    }
    if (view === "acquisition") {
        const [channels, referrers] = await Promise.all([
            getJson<KeyCount[]>("breakdown", range, signal, undefined, "acquisition"),
            getJson<KeyCount[]>("referrers", range, signal, 10),
        ]);
        return { view, channels, referrers };
    }
    const [health, statuses] = await Promise.all([
        getJson<AnalyticsHealthSummary>("health", range, signal),
        getJson<KeyCount[]>("breakdown", range, signal, undefined, "status"),
    ]);
    return { view, health, statuses };
}

function isAnalyticsView(value: string): value is AnalyticsView {
    return ANALYTICS_VIEWS.includes(value as AnalyticsView);
}

async function getJson<T>(
    endpoint: string,
    range: AnalyticsRange,
    signal?: AbortSignal,
    limit?: number,
    dimension?: string,
): Promise<T> {
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
    return response.json() as Promise<T>;
}
