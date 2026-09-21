import states from "cms-control/static/admin/_content/sources/_runtime/source-states.html" with { type: "text" };
import type { DashboardWidget, DashboardDataRef } from "@bernouy/cms-dashboards";
import type { RenderContext } from "../../domain";
import { sourceUrl } from "../source";
import { resolveParams, type RuntimeVars } from "../expressions";

let sourceSequence = 0;

type SourceRef = DashboardDataRef;

export function sourceWrapper(
    sourceId: string,
    ref: SourceRef,
    vars: RuntimeVars,
    alias: string,
    requiredParams: readonly string[] = [],
): HTMLElement {
    const params = resolveParams(ref.params, vars);
    if (requiredParams.some((name) => params[name] === undefined)) {
        return pendingSourceWrapper();
    }
    const url = sourceUrl(sourceId, ref, vars);
    return urlSourceWrapper(`${url.pathname}${url.search}`, alias);
}

export function requiredSourceParams(context: RenderContext, ref: SourceRef): string[] {
    const sourceId = ref.sourceId ?? context.dashboard.source;
    const group = (context.groups ?? [context.group]).find((candidate) => candidate.source.id === sourceId);
    return (
        group?.endpoints
            .find((endpoint) => endpoint.endpointId === ref.endpoint)
            ?.params.filter((param) => param.required)
            .map((param) => param.name) ?? []
    );
}

export function urlSourceWrapper(url: string, alias: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("cms-source", `${url} as ${alias}`);
    wrapper.setAttribute("cms-reload-on", `dashboard:retry:${++sourceSequence}`);
    const template = document.createElement("template");
    template.innerHTML = states as unknown as string;
    wrapper.append(template.content.cloneNode(true));
    return wrapper;
}

function pendingSourceWrapper(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.dataset.dashboardSourcePending = "true";
    return wrapper;
}

export function tableRowsTemplate(widget: Extract<DashboardWidget, { widget: "w-table" }>): HTMLElement {
    const row = document.createElement("cms-dashboard-w-row");
    row.setAttribute("cms-repeat", `${repeatPath("dashboardData", widget.source.itemsPath)} as row`);
    row.setAttribute("row-key", bindingPath("row", widget.rowKey));
    if (widget.selection?.opens) {
        row.setAttribute("collection", widget.selection.opens);
    }
    for (const column of widget.columns) {
        const cell = document.createElement("cms-dashboard-w-cell");
        cell.setAttribute("column", column.id);
        if (column.primary) {
            cell.toggleAttribute("primary", true);
        }
        if (column.primary) {
            cell.setAttribute("meta", "{{ row.id }}");
        }
        if (column.format === "badge") {
            cell.setAttribute("tone", "badge");
        }
        if (column.format === "date" || column.format === "money") {
            cell.dataset.displayFormat = column.format;
            cell.dataset.displayValue = bindingPath("row", column.path);
            if (column.format === "money") {
                cell.dataset.displayCurrency = bindingPath("row", "currency");
            }
        }
        cell.textContent = bindingPath("row", column.path);
        row.append(cell);
    }
    return row;
}

export function navigationItemsTemplate(
    widget: Extract<DashboardWidget, { widget: "w-navigation-list" }>,
    items?: string,
): HTMLElement {
    const item = document.createElement("cms-dashboard-w-navigation-item");
    item.setAttribute("cms-repeat", `${items ?? repeatPath("dashboardData", widget.source.itemsPath)} as row`);
    item.setAttribute("row-key", bindingPath("row", widget.rowKey));
    item.setAttribute("title", bindingPath("row", widget.item.title.path));
    if (widget.item.subtitle) {
        item.setAttribute("subtitle", bindingPath("row", widget.item.subtitle.path));
    }
    if (widget.item.icon) {
        item.setAttribute("icon", widget.item.icon);
    }
    if (widget.item.badge) {
        item.setAttribute("badge", bindingPath("row", widget.item.badge.path));
    }
    if (widget.selection?.opens) {
        item.setAttribute("collection", widget.selection.opens);
    }
    if (widget.reorderable) {
        item.toggleAttribute("reorderable", true);
    }
    return item;
}

function repeatPath(alias: string, path: string | undefined): string {
    return path ? `${alias}.${path}` : alias;
}

function bindingPath(alias: string, path: string): string {
    return `{{ ${path === "." ? alias : `${alias}.${path}`} }}`;
}
