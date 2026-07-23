import type { EndpointPerformanceRow, EndpointPerformanceSort } from "@bernouy/cms-analytics";
import { formatInteger, formatMilliseconds, formatPercent, renderEmpty } from "../../Analytics/rendering/common";

type TableActions = {
    select: (endpointUrn: string) => void;
    sort: (sort: EndpointPerformanceSort) => void;
};

type Column = {
    label: string;
    sort?: EndpointPerformanceSort;
    value: (row: EndpointPerformanceRow) => string;
};

const COLUMNS: Column[] = [
    { label: "Surface", value: (row) => row.surface },
    { label: "Method", value: (row) => row.method },
    { label: "Source endpoint", value: (row) => row.endpointUrn },
    { label: "Calls", sort: "requests", value: (row) => formatInteger(row.requests) },
    { label: "p50", sort: "p50", value: (row) => formatMilliseconds(row.p50Ms) },
    { label: "p95", sort: "p95", value: (row) => formatMilliseconds(row.p95Ms) },
    { label: "p99", sort: "p99", value: (row) => formatMilliseconds(row.p99Ms) },
    { label: "Maximum", sort: "max", value: (row) => formatMilliseconds(row.maxMs) },
    { label: "Error rate", sort: "errorRate", value: (row) => formatRate(row.errorRate) },
];

export function renderEndpointTable(
    host: HTMLElement,
    rows: EndpointPerformanceRow[],
    activeSort: EndpointPerformanceSort,
    order: "asc" | "desc",
    actions: TableActions,
): void {
    if (!rows.length) {
        renderEmpty(host, "No endpoint rows match these filters.");
        return;
    }
    const wrapper = document.createElement("div");
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    wrapper.className = "endpoint-table-scroll";
    table.className = "endpoint-table";
    table.setAttribute("aria-label", "Endpoint aggregate performance");

    for (const column of COLUMNS) {
        const cell = document.createElement("th");
        cell.scope = "col";
        if (column.sort) {
            const button = document.createElement("button");
            const active = column.sort === activeSort;
            button.type = "button";
            button.dataset.sort = column.sort;
            button.textContent = `${column.label}${active ? (order === "asc" ? " ↑" : " ↓") : ""}`;
            button.addEventListener("click", () => actions.sort(column.sort!));
            cell.setAttribute("aria-sort", active ? (order === "asc" ? "ascending" : "descending") : "none");
            cell.append(button);
        } else {
            cell.textContent = column.label;
        }
        headerRow.append(cell);
    }
    head.append(headerRow);

    const body = document.createElement("tbody");
    for (const row of rows) {
        const tableRow = document.createElement("tr");
        for (const [index, column] of COLUMNS.entries()) {
            const cell = document.createElement("td");
            if (index === 2) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "endpoint-select";
                button.dataset.endpoint = row.endpointUrn;
                button.textContent = row.endpointUrn;
                button.title = row.endpointUrn;
                button.addEventListener("click", () => actions.select(row.endpointUrn));
                cell.append(button);
            } else {
                cell.textContent = column.value(row);
            }
            tableRow.append(cell);
        }
        body.append(tableRow);
    }
    table.append(head, body);
    wrapper.append(table);
    host.replaceChildren(wrapper);
}

function formatRate(value: number | null): string {
    return value === null ? "—" : formatPercent(value);
}
