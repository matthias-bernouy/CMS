import type { AnalyticsDashboardData, AnalyticsRange } from "../api";
import { analyticsRangeLabel } from "../api";
import { renderTrafficChart } from "./chart";
import { formatInteger, formatMilliseconds, formatPercent, renderBars, renderFlows, renderMetrics } from "./common";

export function renderAnalyticsDashboard(root: HTMLElement, data: AnalyticsDashboardData, range: AnalyticsRange): void {
    root.querySelectorAll<HTMLElement>("[data-range-label]").forEach((element) => {
        element.textContent = analyticsRangeLabel(range);
    });
    renderReportMeta(target(root, "report-meta"), data);
    if (data.view === "overview") {
        const completedDay = new Date(data.summary.latestCompletedUtcDay).toLocaleDateString(undefined, {
            timeZone: "UTC",
        });
        renderMetrics(target(root, "overview-metrics"), [
            { label: "Content views", value: formatInteger(data.summary.views), hint: "Successful resolved pages" },
            {
                label: "Estimated visitors",
                value: formatInteger(data.summary.latestCompletedDayVisitors),
                hint: `Completed UTC day · ${completedDay}`,
            },
            {
                label: "Estimated visitor-days",
                value: formatInteger(data.summary.visitorDays),
                hint: "Daily estimates summed over this range",
            },
            {
                label: "Average content latency",
                value: formatMilliseconds(data.summary.avgMs),
                hint: "Published after privacy threshold",
            },
        ]);
        renderTrafficChart(target(root, "traffic-chart"), data.timeseries);
        renderBars(target(root, "devices"), data.devices, {
            empty: "No publishable device data in this period.",
            label: titleCase,
        });
        renderBars(target(root, "browsers"), data.browsers, {
            empty: "No publishable browser data in this period.",
            label: titleCase,
        });
        return;
    }
    if (data.view === "content") {
        renderBars(target(root, "top-pages"), data.pages, { empty: "No content views recorded in this period." });
        renderBars(target(root, "entries"), data.entries, {
            empty: "No publishable entry-page counters in this period.",
        });
        renderFlows(target(root, "flows"), data.flows);
        return;
    }
    if (data.view === "origins") {
        renderBars(target(root, "referrers"), data.referrers, {
            empty: "No publishable traffic-origin counters in this period.",
            label: referrerLabel,
        });
        return;
    }

    const errorRate = data.health.requests
        ? (data.health.clientErrors + data.health.serverErrors) / data.health.requests
        : 0;
    renderMetrics(target(root, "health-metrics"), [
        { label: "Requests", value: formatInteger(data.health.requests), hint: "Non-automated delivery requests" },
        {
            label: "Not found",
            value: formatInteger(data.health.notFound),
            hint: "HTTP 404 responses",
            tone: data.health.notFound ? "warning" : undefined,
        },
        {
            label: "Client errors",
            value: formatInteger(data.health.clientErrors),
            hint: "All HTTP 4xx responses",
            tone: data.health.clientErrors ? "warning" : undefined,
        },
        {
            label: "Server errors",
            value: formatInteger(data.health.serverErrors),
            hint: "All HTTP 5xx responses",
            tone: data.health.serverErrors ? "danger" : undefined,
        },
        { label: "Average latency", value: formatMilliseconds(data.health.avgMs), hint: "Across published requests" },
        { label: "Slowest request", value: formatMilliseconds(data.health.maxMs), hint: "Maximum aggregate value" },
    ]);
    target(root, "health-rate").textContent = `${formatPercent(errorRate)} error rate`;
    renderBars(target(root, "statuses"), data.statuses, {
        empty: "No publishable request statuses in this period.",
        label: (key) => `HTTP ${key}`,
        tone: statusTone,
    });
    renderBars(target(root, "latency"), data.latency, {
        empty: "No publishable latency distribution in this period.",
        label: (key) => `${key} ms`,
    });
    renderBars(target(root, "exclusions"), data.exclusions, {
        empty: "No excluded automated requests in this period.",
        label: (key) => titleCase(key.replaceAll("_", " ")),
    });
}

function renderReportMeta(host: HTMLElement, data: AnalyticsDashboardData): void {
    const closed = new Date(data.meta.lastClosedBucket).toLocaleString();
    const saturation = data.meta.referrerSaturated ? " · origin capacity reached; remainder grouped" : "";
    const strong = document.createElement("strong");
    const text = document.createElement("span");
    strong.textContent = "Privacy publication boundary";
    text.textContent = `Closed through ${closed} · minimum ${data.meta.threshold} · rounded to ${data.meta.rounding} · ${data.meta.suppressedValueCount} suppressed · filter ${data.meta.versions.filter}${saturation}`;
    host.replaceChildren(strong, text);
}

function target(root: HTMLElement, role: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(`[data-role="${role}"]`);
    if (!element) {
        throw new Error(`Missing analytics render target: ${role}`);
    }
    return element;
}

function titleCase(value: string): string {
    return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

function statusTone(status: string): string {
    return status.startsWith("5") ? "is-danger" : status.startsWith("4") ? "is-warning" : "";
}

function referrerLabel(key: string): string {
    if (key === "__none__") {
        return "No external referrer";
    }
    if (key === "__other__") {
        return "Other external domains";
    }
    return key;
}
