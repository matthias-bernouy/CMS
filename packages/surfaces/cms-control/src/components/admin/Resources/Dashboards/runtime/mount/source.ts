import type { DashboardWidget } from "@bernouy/cms-dashboards";
import { route } from "../../api";
import { resolveParams, type RuntimeVars } from "../expressions";

export function sourceWrapper(
    sourceId: string,
    ref: { sourceId?: string; endpoint: string; params?: Record<string, string> },
    vars: RuntimeVars,
    alias: string,
): HTMLElement {
    return urlSourceWrapper(sourceUrl(sourceId, ref, vars), alias);
}

export function urlSourceWrapper(url: string, alias: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("cms-source", `${url} as ${alias}`);
    return wrapper;
}

export function jsonAttr(value: unknown): string { return JSON.stringify(value); }

export function tableRowsTemplate(widget: Extract<DashboardWidget, { widget: "w-table" }>): HTMLElement {
    const row = document.createElement("cms-dashboard-w-row");
    row.setAttribute("cms-repeat", `${repeatPath("dashboardData", widget.source.itemsPath)} as row`);
    row.setAttribute("row-key", bindingPath("row", widget.rowKey));
    if (widget.selection?.opens) row.setAttribute("collection", widget.selection.opens);
    for (const column of widget.columns) {
        const cell = document.createElement("cms-dashboard-w-cell");
        cell.setAttribute("column", column.id);
        if (column.primary) cell.toggleAttribute("primary", true);
        if (column.primary) cell.setAttribute("meta", "{{ row.id }}");
        if (column.format === "badge") cell.setAttribute("tone", "badge");
        cell.textContent = bindingPath("row", column.path);
        row.append(cell);
    }
    return row;
}

function sourceUrl(
    sourceId: string,
    ref: { sourceId?: string; endpoint: string; params?: Record<string, string> },
    vars: RuntimeVars,
): string {
    const targetSourceId = ref.sourceId ?? sourceId;
    const url = new URL(route(`/.cms/sources/${encodeURIComponent(targetSourceId)}/${encodeURIComponent(ref.endpoint)}`), window.location.origin);
    for (const [key, value] of Object.entries(resolveParams(ref.params, vars))) url.searchParams.set(key, value);
    return `${url.pathname}${url.search}`;
}

function repeatPath(alias: string, path: string | undefined): string { return path ? `${alias}.${path}` : alias; }
function bindingPath(alias: string, path: string): string { return `{{ ${path === "." ? alias : `${alias}.${path}`} }}`; }
