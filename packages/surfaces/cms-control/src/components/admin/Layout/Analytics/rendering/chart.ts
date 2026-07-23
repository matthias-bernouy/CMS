import type { AnalyticsTimeBucket } from "../api";
import { formatInteger, renderEmpty } from "./common";

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderTrafficChart(host: HTMLElement, rows: AnalyticsTimeBucket[]): void {
    const values = rows.map((row) => Number(row.count) || 0);
    if (!rows.length || values.every((value) => value === 0)) {
        renderEmpty(host, "No content views recorded in this period.");
        return;
    }

    const width = 720;
    const height = 250;
    const left = 46;
    const right = 16;
    const top = 18;
    const bottom = 38;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maximum = Math.max(...values, 1);
    const points = values.map((value, index) => {
        const x = left + (values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth);
        const y = top + (1 - value / maximum) * plotHeight;
        return { x, y };
    });

    const svg = svgElement("svg", {
        class: "traffic-chart",
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": `Content views over time, maximum ${formatInteger(maximum)}`,
    });
    svg.append(line(left, top, left, top + plotHeight), line(left, top + plotHeight, width - right, top + plotHeight));

    const area = svgElement("polygon", {
        class: "traffic-chart__area",
        points: `${left},${top + plotHeight} ${pointList(points)} ${width - right},${top + plotHeight}`,
    });
    const stroke = svgElement("polyline", {
        class: "traffic-chart__line",
        points: pointList(points),
    });
    svg.append(area, stroke);
    for (const point of points) {
        svg.append(
            svgElement("circle", {
                class: "traffic-chart__dot",
                cx: String(point.x),
                cy: String(point.y),
                r: "3",
            }),
        );
    }

    svg.append(
        text(left - 8, top + 4, formatInteger(maximum), "end"),
        text(left - 8, top + plotHeight + 4, "0", "end"),
        text(left, height - 10, formatDate(rows[0]!.bucket), "start"),
        text(width - right, height - 10, formatDate(rows.at(-1)!.bucket), "end"),
    );
    host.replaceChildren(svg);
}

function line(x1: number, y1: number, x2: number, y2: number): SVGElement {
    return svgElement("line", {
        class: "traffic-chart__axis",
        x1: String(x1),
        y1: String(y1),
        x2: String(x2),
        y2: String(y2),
    });
}

function text(x: number, y: number, value: string, anchor: "start" | "end"): SVGElement {
    const node = svgElement("text", {
        class: "traffic-chart__tick",
        x: String(x),
        y: String(y),
        "text-anchor": anchor,
    });
    node.textContent = value;
    return node;
}

function pointList(points: Array<{ x: number; y: number }>): string {
    return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function svgElement(name: string, attributes: Record<string, string>): SVGElement {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    return element;
}

function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}
