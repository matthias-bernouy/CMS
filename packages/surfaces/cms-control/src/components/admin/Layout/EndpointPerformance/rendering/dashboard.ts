import type { EndpointPerformanceQuery, EndpointPerformanceSort } from "@bernouy/cms-analytics";
import type { EndpointPerformanceDashboardView } from "../api";
import { formatInteger, formatMilliseconds, formatPercent, renderMetrics } from "../../Analytics/rendering/common";
import { renderEndpointDetail } from "./detail";
import { renderEndpointTable } from "./table";
import { renderEndpointTimeline } from "./timeline";

type DashboardActions = {
    select: (endpointUrn: string) => void;
    sort: (sort: EndpointPerformanceSort) => void;
};

export function renderEndpointPerformanceDashboard(
    root: HTMLElement,
    data: EndpointPerformanceDashboardView,
    queryState: EndpointPerformanceQuery,
    actions: DashboardActions,
): void {
    const empty = query<HTMLElement>(root, "[data-empty]");
    const content = query<HTMLElement>(root, "[data-content]");
    const noData = data.summary.requests <= 0;
    empty.hidden = !noData;
    content.hidden = noData;

    renderNotices(root, data);
    renderMetadata(root, data);
    if (noData) {
        renderEndpointDetail(root, null);
        return;
    }

    renderMetrics(query(root, '[data-role="metrics"]'), [
        {
            label: "Requests",
            value: formatInteger(data.summary.requests),
            hint: rangeLabel(queryState.range),
        },
        {
            label: "Error rate",
            value: data.summary.errorRate === null ? "—" : formatPercent(data.summary.errorRate),
            hint: `${formatInteger(data.summary.errors)} error responses`,
            tone: data.summary.errors > 0 ? "danger" : undefined,
        },
        {
            label: "p50 latency",
            value: formatMilliseconds(data.summary.p50Ms),
            hint: "Median aggregate latency",
        },
        {
            label: "p95 latency",
            value: formatMilliseconds(data.summary.p95Ms),
            hint: "95% completed at or below",
        },
        {
            label: "p99 latency",
            value: formatMilliseconds(data.summary.p99Ms),
            hint: `Maximum ${formatMilliseconds(data.summary.maxMs)}`,
        },
    ]);
    renderEndpointTimeline(query(root, '[data-role="timeline"]'), data.timeline);
    renderEndpointTable(
        query(root, '[data-role="endpoint-table"]'),
        data.endpoints,
        queryState.sort,
        queryState.order,
        actions,
    );
    renderEndpointDetail(root, data.detail);
}

function renderNotices(root: HTMLElement, data: EndpointPerformanceDashboardView): void {
    const partial = query<HTMLElement>(root, "[data-partial]");
    const stale = query<HTMLElement>(root, "[data-stale]");
    partial.hidden = !data.meta.partial;
    stale.hidden = !data.meta.stale;
    partial.textContent = [
        "This report is partial. Collector-wide health:",
        `${formatInteger(data.meta.dropped)} dropped,`,
        `${formatInteger(data.meta.invalid)} invalid,`,
        `${formatInteger(data.meta.flushFailures)} flush failures.`,
        ...(data.meta.collectorCountsExact ? [] : ["Loss counters may be estimates."]),
    ].join(" ");
    stale.textContent = data.meta.lastObservationAt
        ? `This report is stale. Last observation: ${formatDate(data.meta.lastObservationAt)}.`
        : "This report is stale. No recent observation timestamp is available.";
}

function renderMetadata(root: HTMLElement, data: EndpointPerformanceDashboardView): void {
    query<HTMLElement>(root, '[data-role="report-meta"]').textContent = [
        `Generated ${formatDate(data.meta.generatedAt)}`,
        `${formatInteger(data.meta.accepted)} accepted observations`,
        `${formatInteger(data.meta.dropped)} dropped collector-wide`,
        `${formatInteger(data.meta.invalid)} invalid collector-wide`,
        `${formatInteger(data.meta.flushFailures)} flush failures collector-wide`,
    ].join(" · ");
}

function query<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
    const element = root.querySelector(selector);
    if (!element) {
        throw new Error(`Missing endpoint performance element: ${selector}`);
    }
    return element as T;
}

function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "at an unknown time"
        : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function rangeLabel(range: EndpointPerformanceQuery["range"]): string {
    return range === "1h" ? "Last hour" : range === "7d" ? "Last 7 days" : "Last 24 hours";
}
