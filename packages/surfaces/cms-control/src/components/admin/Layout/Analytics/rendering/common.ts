import type { FlowCount, KeyCount } from "@bernouy/cms-analytics";

export type Metric = {
    label: string;
    value: string;
    hint: string;
    tone?: "danger" | "warning";
};

const INTEGER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function formatInteger(value: number): string {
    return INTEGER.format(Math.round(value));
}

export function formatDecimal(value: number): string {
    return DECIMAL.format(value);
}

export function formatMilliseconds(value: number): string {
    return `${formatInteger(value)} ms`;
}

export function formatPercent(value: number): string {
    return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(value);
}

export function renderMetrics(host: HTMLElement, metrics: Metric[]): void {
    host.replaceChildren(
        ...metrics.map((metric) => {
            const card = document.createElement("article");
            card.className = `metric${metric.tone ? ` metric--${metric.tone}` : ""}`;
            const label = document.createElement("span");
            const value = document.createElement("strong");
            const hint = document.createElement("span");
            label.className = "metric__label";
            value.className = "metric__value";
            hint.className = "metric__hint";
            label.textContent = metric.label;
            value.textContent = metric.value;
            hint.textContent = metric.hint;
            card.append(label, value, hint);
            return card;
        }),
    );
}

export function renderBars(
    host: HTMLElement,
    rows: KeyCount[],
    options: {
        empty: string;
        label?: (key: string) => string;
        tone?: (key: string) => string;
    },
): void {
    if (!rows.length) {
        renderEmpty(host, options.empty);
        return;
    }
    const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;
    host.replaceChildren(
        ...rows.map((row) => {
            const item = document.createElement("div");
            const header = document.createElement("div");
            const label = document.createElement("span");
            const value = document.createElement("span");
            const track = document.createElement("span");
            const fill = document.createElement("span");
            const percentage = row.count / total;
            item.className = `bar-item ${options.tone?.(row.key) ?? ""}`.trim();
            header.className = "bar-item__header";
            label.className = "bar-item__label";
            value.className = "bar-item__value";
            track.className = "bar-item__track";
            fill.className = "bar-item__fill";
            label.textContent = options.label?.(row.key) ?? row.key;
            label.title = label.textContent;
            value.textContent = `${formatInteger(row.count)} · ${formatPercent(percentage)}`;
            fill.style.width = `${Math.max(percentage * 100, 1)}%`;
            header.append(label, value);
            track.append(fill);
            item.append(header, track);
            return item;
        }),
    );
}

export function renderFlows(host: HTMLElement, flows: FlowCount[]): void {
    if (!flows.length) {
        renderEmpty(host, "No internal journeys recorded in this period.");
        return;
    }
    host.replaceChildren(
        ...flows.map((flow) => {
            const row = document.createElement("div");
            const journey = document.createElement("div");
            const from = document.createElement("span");
            const arrow = document.createElement("span");
            const to = document.createElement("span");
            const count = document.createElement("strong");
            row.className = "flow-row";
            journey.className = "flow-row__journey";
            from.textContent = flow.from;
            arrow.className = "flow-row__arrow";
            arrow.textContent = "→";
            to.textContent = flow.to;
            count.textContent = formatInteger(flow.count);
            journey.append(from, arrow, to);
            row.append(journey, count);
            return row;
        }),
    );
}

export function renderEmpty(host: HTMLElement, message: string): void {
    const empty = document.createElement("div");
    empty.className = "analytics-empty";
    empty.textContent = message;
    host.replaceChildren(empty);
}
