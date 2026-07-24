import type { EndpointPerformanceDetail } from "@bernouy/cms-analytics";
import {
    formatInteger,
    formatMilliseconds,
    formatPercent,
    renderBars,
    renderEmpty,
} from "../../Analytics/rendering/common";

const STAGE_LABELS: Record<string, string> = {
    cms_auth: "Authentication",
    cms_endpoint_auth_lookup: "Authorization endpoint lookup",
    cms_authorize: "Authorization",
    cms_roles: "Roles",
    cms_endpoint_resolve: "Source resolution",
    cms_source: "Source read",
    cms_overlays: "Overlays",
    cms_context: "Context",
    cms_secret: "Secrets",
    cms_headers: "Request headers",
    cms_body: "Request body",
    cms_upstream: "Combined upstream time",
    cms_projection: "Projection",
    cms_identity_binding: "Identity binding",
    cms_total: "CMS total",
    edge_route: "Edge routing",
    edge_db_wall: "Edge database wall time",
    edge_db_sum: "Edge database query time",
    edge_db_calls: "Edge database calls",
    edge_provider: "Edge provider",
    edge_projection: "Edge projection",
    edge_total: "Edge total",
};

export function renderEndpointDetail(root: HTMLElement, detail: EndpointPerformanceDetail | null): void {
    const empty = query<HTMLElement>(root, "[data-detail-empty]");
    const content = query<HTMLElement>(root, "[data-detail]");
    empty.hidden = detail !== null;
    content.hidden = detail === null;
    if (!detail) {
        return;
    }

    query<HTMLElement>(root, '[data-role="detail-title"]').textContent = detail.endpointUrn;
    query<HTMLElement>(root, '[data-role="detail-context"]').textContent = [
        detail.surface ? label(detail.surface) : "All surfaces",
        detail.method ?? "All methods",
    ].join(" · ");
    renderBars(
        query(root, '[data-role="statuses"]'),
        detail.statuses.map((row) => ({ key: row.statusClass, count: row.count })),
        {
            empty: "No status distribution is available.",
            label: (status) => `HTTP ${status}`,
            tone: (status) => (status === "5xx" ? "is-danger" : status === "4xx" ? "is-warning" : ""),
        },
    );
    renderBars(
        query(root, '[data-role="histogram"]'),
        detail.latencyHistogram.map((row) => ({
            key: row.upperBoundMs === null ? "overflow" : String(row.upperBoundMs),
            count: row.count,
        })),
        {
            empty: "No latency histogram is available.",
            label: (bound) => (bound === "overflow" ? "Above final bound" : `≤ ${formatInteger(Number(bound))} ms`),
        },
    );
    renderStages(query(root, '[data-role="stages"]'), detail.stages);
}

function renderStages(host: HTMLElement, stages: EndpointPerformanceDetail["stages"]): void {
    if (!stages.length) {
        renderEmpty(host, "No stage timings were reported for this endpoint.");
        return;
    }
    const wrapper = document.createElement("div");
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const body = document.createElement("tbody");
    wrapper.className = "endpoint-table-scroll";
    table.className = "endpoint-table endpoint-stage-table";
    table.setAttribute("aria-label", "Endpoint stage timings; durations may overlap");
    head.append(headerRow(["Stage", "Coverage", "Samples", "Average", "p50", "p95", "p99", "Total", "Maximum"]));

    for (const stage of stages) {
        const row = document.createElement("tr");
        const values = [
            STAGE_LABELS[stage.stage] ?? label(stage.stage),
            formatPercent(clampRate(stage.coverage)),
            formatInteger(stage.observations),
            stage.kind === "duration" ? formatMilliseconds(stage.avgMs) : formatCount(stage.avg),
            stage.kind === "duration" ? formatMilliseconds(stage.p50Ms) : "—",
            stage.kind === "duration" ? formatMilliseconds(stage.p95Ms) : "—",
            stage.kind === "duration" ? formatMilliseconds(stage.p99Ms) : "—",
            stage.kind === "duration" ? "—" : formatCount(stage.total),
            stage.kind === "duration" ? formatMilliseconds(stage.maxMs) : formatCount(stage.max),
        ];
        for (const value of values) {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
        }
        body.append(row);
    }
    table.append(head, body);
    wrapper.append(table);
    host.replaceChildren(wrapper);
}

function formatCount(value: number | null): string {
    return value === null ? "—" : formatInteger(value);
}

function headerRow(labels: string[]): HTMLTableRowElement {
    const row = document.createElement("tr");
    for (const value of labels) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = value;
        row.append(cell);
    }
    return row;
}

function query<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
    const element = root.querySelector(selector);
    if (!element) {
        throw new Error(`Missing endpoint detail element: ${selector}`);
    }
    return element as T;
}

function label(value: string): string {
    const normalized = value.replaceAll("_", " ");
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function clampRate(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0;
}
