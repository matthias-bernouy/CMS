import type { EndpointPerformanceDashboardView } from "../api";
import { formatInteger, renderEmpty } from "../../Analytics/rendering/common";

const SVG_NS = "http://www.w3.org/2000/svg";
type TimelinePoint = EndpointPerformanceDashboardView["timeline"][number];

export function renderEndpointTimeline(host: HTMLElement, rows: TimelinePoint[]): void {
    if (!rows.length || rows.every((row) => positive(row.requests) === 0)) {
        renderEmpty(host, "No endpoint requests were observed in this range.");
        return;
    }

    const width = 860;
    const height = 260;
    const plot = { left: 50, right: 52, top: 18, bottom: 38 };
    const plotWidth = width - plot.left - plot.right;
    const plotHeight = height - plot.top - plot.bottom;
    const maxRequests = Math.max(...rows.map((row) => positive(row.requests)), 1);
    const maxP95 = Math.max(...rows.map((row) => positive(row.p95Ms)), 1);
    const x = (index: number) =>
        plot.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);

    const svg = svgNode("svg", {
        class: "endpoint-timeline",
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": "Endpoint requests, p95 latency, and error rate over time",
    });
    svg.append(
        line(plot.left, plot.top, plot.left, plot.top + plotHeight),
        line(plot.left, plot.top + plotHeight, width - plot.right, plot.top + plotHeight),
    );

    const barWidth = Math.max(Math.min(plotWidth / Math.max(rows.length, 1) - 2, 16), 2);
    rows.forEach((row, index) => {
        const barHeight = (positive(row.requests) / maxRequests) * plotHeight;
        svg.append(
            svgNode("rect", {
                class: "endpoint-timeline__volume",
                x: String(x(index) - barWidth / 2),
                y: String(plot.top + plotHeight - barHeight),
                width: String(barWidth),
                height: String(barHeight),
            }),
        );
    });

    appendSeries(
        svg,
        rows,
        "endpoint-timeline__p95",
        x,
        (row) => nullablePositive(row.p95Ms),
        (value) => plot.top + (1 - value / maxP95) * plotHeight,
    );
    appendSeries(
        svg,
        rows,
        "endpoint-timeline__errors",
        x,
        (row) => nullableRate(row.errorRate),
        (value) => plot.top + (1 - value) * plotHeight,
    );

    svg.append(
        text(plot.left - 8, plot.top + 4, formatInteger(maxRequests), "end"),
        text(plot.left - 8, plot.top + plotHeight + 4, "0", "end"),
        text(width - plot.right + 8, plot.top + 4, "100%", "start"),
        text(width - plot.right + 8, plot.top + plotHeight + 4, "0%", "start"),
        text(plot.left, height - 10, formatBucket(rows[0]!.bucket), "start"),
        text(width - plot.right, height - 10, formatBucket(rows.at(-1)!.bucket), "end"),
    );
    host.replaceChildren(svg);
}

function appendSeries(
    svg: SVGElement,
    rows: TimelinePoint[],
    className: string,
    x: (index: number) => number,
    valueOf: (row: TimelinePoint) => number | null,
    y: (value: number) => number,
): void {
    const points = rows.flatMap((row, index) => {
        const value = valueOf(row);
        return value === null ? [] : [{ x: x(index), y: y(value) }];
    });
    if (!points.length) {
        return;
    }
    svg.append(
        svgNode("polyline", {
            class: className,
            points: points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
        }),
    );
    for (const point of points) {
        svg.append(
            svgNode("circle", {
                class: `${className} endpoint-timeline__point`,
                cx: String(point.x),
                cy: String(point.y),
                r: "2.5",
            }),
        );
    }
}

function svgNode(name: string, attributes: Record<string, string>): SVGElement {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    return element;
}

function line(x1: number, y1: number, x2: number, y2: number): SVGElement {
    return svgNode("line", {
        class: "endpoint-timeline__axis",
        x1: String(x1),
        y1: String(y1),
        x2: String(x2),
        y2: String(y2),
    });
}

function text(x: number, y: number, value: string, anchor: "start" | "end"): SVGElement {
    const element = svgNode("text", {
        class: "endpoint-timeline__tick",
        x: String(x),
        y: String(y),
        "text-anchor": anchor,
    });
    element.textContent = value;
    return element;
}

function positive(value: number | null): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function nullablePositive(value: number | null): number | null {
    return value === null ? null : positive(value);
}

function nullableRate(value: number | null): number | null {
    return value === null || !Number.isFinite(value) ? null : Math.max(0, Math.min(value, 1));
}

function formatBucket(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "Unknown"
        : new Intl.DateTimeFormat(undefined, { day: "numeric", hour: "2-digit", month: "short" }).format(date);
}
