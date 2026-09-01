import type { DashboardWidget } from "@bernouy/cms-dashboards";
import type { DashboardRuntimeWidget, DetailSelection, RenderContext } from "../../domain";
import "./../../widgets/w-section/WSection";
import "./../../widgets/w-table/WTable";
import { detailElement } from "./detail";
import { navigationListElement, selectionVars } from "./navigation";
import { appendSourceContent, jsonAttr, requiredSourceParams, sourceWrapper, tableRowsTemplate } from "./mountSource";

export function mountDashboardWidgets(
    root: HTMLElement,
    widgets: DashboardRuntimeWidget[],
    context: RenderContext,
    key: string,
    tabState: Map<string, number>,
    detail: DetailSelection | null,
): void {
    const core = document.createElement("cms-binding-core");
    core.className = "dashboard-widget-binding";
    core.replaceChildren(
        ...widgets.map((widget, index) => widgetElement(widget, context, `${key}.${index}`, tabState, detail)),
    );
    root.replaceChildren(core);
}

function widgetElement(
    widget: DashboardRuntimeWidget,
    context: RenderContext,
    key: string,
    tabState: Map<string, number>,
    detail: DetailSelection | null,
): HTMLElement {
    if (widget.widget === "w-section") {
        return sectionElement(widget, context, key, tabState, detail);
    }
    if (widget.widget === "w-tabs") {
        return tabsElement(widget, context, key, tabState, detail);
    }
    if (widget.widget === "w-table") {
        return tableElement(widget, context, detail);
    }
    if (widget.widget === "w-navigation-list") {
        return navigationListElement(widget, context, detail);
    }
    if (widget.widget === "w-detail") {
        return detailElement(widget, context, detail);
    }
    return document.createElement("span");
}

function sectionElement(
    widget: Extract<DashboardWidget, { widget: "w-section" }>,
    context: RenderContext,
    key: string,
    tabState: Map<string, number>,
    detail: DetailSelection | null,
): HTMLElement {
    const element = document.createElement("cms-dashboard-w-section");
    element.setAttribute("heading", widget.title);
    if (widget.description) {
        element.setAttribute("description", widget.description);
    }
    const stack = document.createElement("div");
    stack.className = "widget-stack";
    stack.append(
        ...widget.children.map((child, index) => widgetElement(child, context, `${key}.${index}`, tabState, detail)),
    );
    element.append(stack);
    return element;
}

function tabsElement(
    widget: Extract<DashboardWidget, { widget: "w-tabs" }>,
    context: RenderContext,
    key: string,
    tabState: Map<string, number>,
    detail: DetailSelection | null,
): HTMLElement {
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
    if (active) {
        body.append(
            ...active.children.map((child, index) =>
                widgetElement(child, context, `${key}.${activeIndex}.${index}`, tabState, detail),
            ),
        );
    }
    panel.append(tabs, body);
    return panel;
}

function tableElement(
    widget: Extract<DashboardWidget, { widget: "w-table" }>,
    context: RenderContext,
    detail: DetailSelection | null,
): HTMLElement {
    const filters = { ...(context.filters?.get(widget.id) ?? {}) };
    const wrapper = sourceWrapper(
        context.dashboard.source,
        widget.source,
        { ...selectionVars(detail), filters },
        "dashboardData",
        requiredSourceParams(context, widget.source),
    );
    const element = document.createElement("cms-dashboard-w-table");
    element.setAttribute("data-config-json", jsonAttr(widget));
    element.setAttribute("data-filters-json", jsonAttr(filters));
    element.setAttribute("data-selected", context.selectedRows.get(widget.selection?.opens ?? widget.id) ?? "");
    element.append(tableRowsTemplate(widget));
    appendSourceContent(wrapper, element);
    return wrapper;
}
