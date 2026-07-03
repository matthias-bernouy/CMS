import type { DashboardWidget } from "@bernouy/cms-dashboards";
import type { DetailSelection, RenderContext } from "../domain";
import "./../widgets/w-section/WSection";
import "./../widgets/w-table/WTable";
import "./../widgets/w-detail/WDetail";
import { route } from "../api";
import { resolveParams, type RuntimeVars } from "./expressions";
import { detailReloadEvent } from "./reload";

export function mountDashboardWidgets(
    root: HTMLElement,
    widgets: DashboardWidget[],
    context: RenderContext,
    key: string,
    tabState: Map<string, number>,
    detail: DetailSelection | null,
): void {
    const core = document.createElement("cms-binding-core");
    core.className = "dashboard-widget-binding";
    core.replaceChildren(...widgets.map((widget, index) =>
        widgetElement(widget, context, `${key}.${index}`, tabState, detail),
    ));
    root.replaceChildren(core);
}

function widgetElement(widget: DashboardWidget, context: RenderContext, key: string, tabState: Map<string, number>, detail: DetailSelection | null): HTMLElement {
    if (widget.widget === "w-section") return sectionElement(widget, context, key, tabState, detail);
    if (widget.widget === "w-tabs") return tabsElement(widget, context, key, tabState, detail);
    if (widget.widget === "w-table") return tableElement(widget, context);
    if (widget.widget === "w-detail") return detailElement(widget, context, detail);
    return document.createElement("span");
}

function sectionElement(widget: Extract<DashboardWidget, { widget: "w-section" }>, context: RenderContext, key: string, tabState: Map<string, number>, detail: DetailSelection | null): HTMLElement {
    const element = document.createElement("cms-dashboard-w-section");
    element.setAttribute("heading", widget.title);
    if (widget.description) element.setAttribute("description", widget.description);
    const stack = document.createElement("div");
    stack.className = "widget-stack";
    stack.append(...widget.children.map((child, index) => widgetElement(child, context, `${key}.${index}`, tabState, detail)));
    element.append(stack);
    return element;
}

function tabsElement(widget: Extract<DashboardWidget, { widget: "w-tabs" }>, context: RenderContext, key: string, tabState: Map<string, number>, detail: DetailSelection | null): HTMLElement {
    const panel = document.createElement("section");
    panel.className = "tabs-panel";
    const tabs = document.createElement("div");
    tabs.className = "tabs";
    tabs.setAttribute("role", "tablist");
    const body = document.createElement("div");
    body.className = "tab-body";
    const activeIndex = Math.min(tabState.get(key) ?? 0, Math.max(widget.tabs.length - 1, 0));
    const active = widget.tabs[activeIndex];
    for (const [index, tab] of widget.tabs.entries()) {
        const button = document.createElement("button");
        button.className = `tab ${index === activeIndex ? "active" : ""}`.trim();
        button.type = "button";
        button.dataset.tabKey = key;
        button.dataset.tabIndex = String(index);
        button.textContent = tab.label;
        tabs.append(button);
    }
    if (active) body.append(...active.children.map((child, index) => widgetElement(child, context, `${key}.${activeIndex}.${index}`, tabState, detail)));
    panel.append(tabs, body);
    return panel;
}

function tableElement(widget: Extract<DashboardWidget, { widget: "w-table" }>, context: RenderContext): HTMLElement {
    const wrapper = sourceWrapper(context.dashboard.source, widget.source, {}, "dashboardData");
    const element = document.createElement("cms-dashboard-w-table");
    element.setAttribute("data-config-json", jsonAttr(widget));
    element.setAttribute("data-selected", context.selectedRows.get(widget.selection?.opens ?? widget.id) ?? "");
    element.append(tableRowsTemplate(widget));
    wrapper.append(element);
    return wrapper;
}

function detailElement(widget: Extract<DashboardWidget, { widget: "w-detail" }>, context: RenderContext, detail: DetailSelection | null): HTMLElement {
    const rowKey = detail?.row ?? "";
    const wrapper = sourceWrapper(context.dashboard.source, widget.source, { selection: { id: rowKey } }, "dashboardData");
    wrapper.setAttribute("cms-reload-on", detailReloadEvent(context.dashboard.source, context.dashboard.id, widget.id, rowKey));
    const element = document.createElement("cms-dashboard-w-detail");
    element.setAttribute("data-config-json", jsonAttr(widget));
    element.setAttribute("data-source-json", "{{ dashboardData | json }}");
    element.setAttribute("data-row-key", rowKey);
    element.setAttribute("data-source-id", context.dashboard.source);
    wrapper.append(element);
    return wrapper;
}

function sourceWrapper(sourceId: string, ref: { endpoint: string; params?: Record<string, string> }, vars: RuntimeVars, alias: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("cms-source", `${sourceUrl(sourceId, ref, vars)} as ${alias}`);
    return wrapper;
}

function sourceUrl(sourceId: string, ref: { endpoint: string; params?: Record<string, string> }, vars: RuntimeVars): string {
    const url = new URL(route(`/.cms/sources/${encodeURIComponent(sourceId)}/${encodeURIComponent(ref.endpoint)}`), window.location.origin);
    for (const [key, value] of Object.entries(resolveParams(ref.params, vars))) url.searchParams.set(key, value);
    return `${url.pathname}${url.search}`;
}

function jsonAttr(value: unknown): string {
    return JSON.stringify(value);
}

function tableRowsTemplate(widget: Extract<DashboardWidget, { widget: "w-table" }>): HTMLElement {
    const row = document.createElement("cms-dashboard-w-row");
    row.setAttribute("cms-repeat", `${repeatPath("dashboardData", widget.source.itemsPath)} as row`);
    row.setAttribute("row-key", bindingPath("row", widget.rowKey));
    row.setAttribute("collection", widget.selection?.opens ?? widget.id);
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

function repeatPath(alias: string, path: string | undefined): string {
    return path ? `${alias}.${path}` : alias;
}

function bindingPath(alias: string, path: string): string {
    return `{{ ${path === "." ? alias : `${alias}.${path}`} }}`;
}
