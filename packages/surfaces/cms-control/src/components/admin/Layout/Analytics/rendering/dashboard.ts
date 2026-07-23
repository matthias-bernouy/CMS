import type { AnalyticsDashboardData, AnalyticsRange } from "../api";
import { analyticsRangeLabel } from "../api";
import { renderTrafficChart } from "./chart";
import {
    formatDecimal,
    formatInteger,
    formatMilliseconds,
    formatPercent,
    renderBars,
    renderFlows,
    renderMetrics,
} from "./common";

const CHANNEL_LABELS: Record<string, string> = {
    direct: "Direct",
    internal: "Internal navigation",
    search: "Search engines",
    social: "Social networks",
    referral: "Referrals",
};

export function renderAnalyticsDashboard(root: HTMLElement, data: AnalyticsDashboardData, range: AnalyticsRange): void {
    root.querySelectorAll<HTMLElement>("[data-range-label]").forEach((element) => {
        element.textContent = analyticsRangeLabel(range);
    });
    if (data.view === "overview") {
        const viewsPerVisitorDay = data.summary.visitorDays ? data.summary.views / data.summary.visitorDays : 0;
        renderMetrics(target(root, "overview-metrics"), [
            { label: "Content views", value: formatInteger(data.summary.views), hint: "Successful page responses" },
            {
                label: "Average daily visitors",
                value: formatDecimal(data.summary.averageDailyVisitors),
                hint: "Cookieless daily estimate",
            },
            {
                label: "Visitor-days",
                value: formatInteger(data.summary.visitorDays),
                hint: "Daily unique totals combined",
            },
            {
                label: "Views per visitor-day",
                value: formatDecimal(viewsPerVisitorDay),
                hint: "Content depth indicator",
            },
        ]);
        renderTrafficChart(target(root, "traffic-chart"), data.timeseries);
        return;
    }
    if (data.view === "content") {
        renderBars(target(root, "top-pages"), data.pages, { empty: "No content views recorded in this period." });
        renderFlows(target(root, "flows"), data.flows);
        renderBars(target(root, "devices"), data.devices, {
            empty: "No device data recorded in this period.",
            label: titleCase,
        });
        renderBars(target(root, "browsers"), data.browsers, {
            empty: "No browser data recorded in this period.",
            label: titleCase,
        });
        return;
    }
    if (data.view === "acquisition") {
        renderBars(target(root, "channels"), data.channels, {
            empty: "No acquisition data recorded in this period.",
            label: (key) => CHANNEL_LABELS[key] ?? titleCase(key),
        });
        renderBars(target(root, "referrers"), data.referrers, {
            empty: "No external referrers recorded in this period.",
        });
        return;
    }

    const errorRate = data.health.requests
        ? (data.health.clientErrors + data.health.serverErrors) / data.health.requests
        : 0;
    renderMetrics(target(root, "health-metrics"), [
        { label: "Requests", value: formatInteger(data.health.requests), hint: "Non-bot delivery requests" },
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
        { label: "Average latency", value: formatMilliseconds(data.health.avgMs), hint: "Across all requests" },
        { label: "Slowest request", value: formatMilliseconds(data.health.maxMs), hint: "Maximum observed latency" },
    ]);
    target(root, "health-rate").textContent = `${formatPercent(errorRate)} error rate`;
    renderBars(target(root, "statuses"), data.statuses, {
        empty: "No request statuses recorded in this period.",
        label: (key) => `HTTP ${key}`,
        tone: statusTone,
    });
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
