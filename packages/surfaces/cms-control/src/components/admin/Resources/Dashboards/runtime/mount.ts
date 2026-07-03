import type { DashboardWidget } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../types";
import type { DetailSelection, RenderContext } from "../domain";
import "./../widgets/w-section/WSection";
import "./../widgets/w-table/WTable";
import "./../widgets/w-detail/WDetail";
import type { DashboardWTable } from "../widgets/w-table/WTable";
import type { DashboardWDetail } from "../widgets/w-detail/WDetail";
import { fetchSourceJson, itemFrom, itemsFrom } from "./source";
import { detailData, fieldValues, tableData, type DetailOptions } from "./mapping";
import { detailLookupOptions } from "./lookups";
import { detailKey } from "../domain";

const detailOptionsCache = new Map<string, DetailOptions>();

export function mountDashboardWidgets(
    root: HTMLElement,
    widgets: DashboardWidget[],
    context: RenderContext,
    key: string,
    tabState: Map<string, number>,
    detail: DetailSelection | null,
): void {
    root.replaceChildren(...widgets.map((widget, index) =>
        widgetElement(widget, context, `${key}.${index}`, tabState, detail),
    ));
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
    const element = document.createElement("cms-dashboard-w-table") as unknown as DashboardWTable;
    element.data = tableData(widget, []);
    element.selected = context.selectedRows.get(widget.selection?.opens ?? widget.id) ?? "";
    void fetchSourceJson(context.dashboard.source, widget.source, {})
        .then(data => { element.data = tableData(widget, itemsFrom(data, widget.source)); })
        .catch(error => { element.data = { ...tableData(widget, []), subtitle: error instanceof Error ? error.message : "Source request failed" }; });
    return element as unknown as HTMLElement;
}

function detailElement(widget: Extract<DashboardWidget, { widget: "w-detail" }>, context: RenderContext, detail: DetailSelection | null): HTMLElement {
    const element = document.createElement("cms-dashboard-w-detail") as unknown as DashboardWDetail;
    const rowKey = detail?.row ?? "";
    const optionsKey = detailOptionKey(context, widget.id, rowKey);
    const cachedOptions = detailOptionsCache.get(optionsKey) ?? {};
    const draft = context.drafts.get(detailKey(widget.id, rowKey)) ?? {};
    element.data = detailData(widget, {}, rowKey, draft, cachedOptions, context.dashboard.source);
    void fetchSourceJson(context.dashboard.source, widget.source, { selection: { id: rowKey } })
        .then(async data => {
            const resource = itemFrom(data, widget.source);
            const fields = { ...fieldValues(widget, resource), ...draft };
            element.data = detailData(widget, resource, rowKey, draft, cachedOptions, context.dashboard.source);
            const options = await detailLookupOptions(context.dashboard.source, widget, resource, fields);
            const mergedOptions = storeDetailOptions(optionsKey, options);
            element.data = detailData(widget, resource, rowKey, draft, mergedOptions, context.dashboard.source);
        })
        .catch(error => {
            element.data = detailData({ ...widget, title: { fallback: error instanceof Error ? error.message : "Source request failed", path: "" } }, {}, rowKey, draft, cachedOptions, context.dashboard.source);
        });
    return element as unknown as HTMLElement;
}

function detailOptionKey(context: RenderContext, widgetId: string, rowKey: string): string {
    return `${context.dashboard.source}:${context.dashboard.id}:${widgetId}:${rowKey}`;
}

function storeDetailOptions(key: string, options: DetailOptions): DetailOptions {
    const merged = { ...(detailOptionsCache.get(key) ?? {}), ...options };
    detailOptionsCache.set(key, merged);
    return merged;
}
