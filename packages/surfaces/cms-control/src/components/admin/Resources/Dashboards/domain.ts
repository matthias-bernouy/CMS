import type { DashboardDto, DashboardWidget } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "./types";

export type DetailSelection = {
    collection: string;
    row: string;
};

export type RenderContext = {
    group: DashboardSourceGroup;
    dashboard: DashboardDto;
    selectedRows: ReadonlyMap<string, string>;
};

export function renderWidgetList(widgets: DashboardWidget[], context: RenderContext, key: string, tabState: Map<string, number>): string {
    return widgets.map((widget, index) => renderWidget(widget, context, `${key}.${index}`, tabState)).filter(Boolean).join("");
}

export function widgetsForSelection(dashboard: DashboardDto, detail: DetailSelection | null): DashboardWidget[] {
    return detail ? detailWidgetsFor(dashboard.views, detail.collection) : mainWidgetsFor(dashboard.views);
}

function renderWidget(widget: DashboardWidget, context: RenderContext, key: string, tabState: Map<string, number>): string {
    if (widget.widget === "w-section") return renderSection(widget, context, key, tabState);
    if (widget.widget === "w-tabs") return renderTabs(widget, context, key, tabState);
    return renderMigrationPlaceholder(widget);
}

function renderSection(widget: Extract<DashboardWidget, { widget: "w-section" }>, context: RenderContext, key: string, tabState: Map<string, number>): string {
    return `
        <cms-dashboard-w-section heading="${escapeAttr(widget.title ?? "Section")}">
            <div class="widget-stack">${renderWidgetList(widget.children, context, key, tabState)}</div>
        </cms-dashboard-w-section>
    `;
}

function renderTabs(widget: Extract<DashboardWidget, { widget: "w-tabs" }>, context: RenderContext, key: string, tabState: Map<string, number>): string {
    const activeIndex = Math.min(tabState.get(key) ?? 0, Math.max(widget.tabs.length - 1, 0));
    const active = widget.tabs[activeIndex];
    return `
        <section class="tabs-panel">
            <div class="tabs" role="tablist">
                ${widget.tabs.map((tab, index) => `
                    <button class="tab ${index === activeIndex ? "active" : ""}" type="button" data-tab-key="${escapeAttr(key)}" data-tab-index="${index}">
                        ${escapeHtml(tab.label)}
                    </button>
                `).join("")}
            </div>
            <div class="tab-body">${active ? renderWidgetList(active.children, context, `${key}.${activeIndex}`, tabState) : ""}</div>
        </section>
    `;
}

function renderMigrationPlaceholder(widget: DashboardWidget): string {
    return `
        <cms-dashboard-w-section heading="${escapeAttr(widgetTitle(widget))}">
            <p class="migration-placeholder">This dashboard widget is waiting for the new source-owned widget runtime.</p>
        </cms-dashboard-w-section>
    `;
}

function mainWidgetsFor(widgets: DashboardWidget[]): DashboardWidget[] {
    return widgets.flatMap(widget => {
        if (isDetailWidget(widget)) return [];
        if (widget.widget === "w-section") return sectionWithChildren(widget, mainWidgetsFor(widget.children));
        if (widget.widget === "w-tabs") return tabsWithChildren(widget, tab => mainWidgetsFor(tab.children));
        return [widget];
    });
}

function detailWidgetsFor(widgets: DashboardWidget[], collection: string): DashboardWidget[] {
    return widgets.flatMap(widget => {
        if (widget.widget === "w-section") return sectionWithChildren(widget, detailWidgetsFor(widget.children, collection));
        if (widget.widget === "w-tabs") return tabsWithChildren(widget, tab => detailWidgetsFor(tab.children, collection));
        return widgetHasCollection(widget, collection) && !isMainOnlyWidget(widget) ? [widget] : [];
    });
}

function sectionWithChildren(widget: Extract<DashboardWidget, { widget: "w-section" }>, children: DashboardWidget[]): DashboardWidget[] {
    return children.length ? [{ ...widget, children }] : [];
}

function tabsWithChildren(widget: Extract<DashboardWidget, { widget: "w-tabs" }>, map: (tab: { label: string; children: DashboardWidget[] }) => DashboardWidget[]): DashboardWidget[] {
    const tabs = widget.tabs.map(tab => ({ label: tab.label, children: map(tab) })).filter(tab => tab.children.length);
    return tabs.length ? [{ ...widget, tabs }] : [];
}

function isDetailWidget(widget: DashboardWidget): boolean {
    return widget.widget === "w-detail" || widget.widget === "w-resource-page" || widget.widget === "w-update" || widget.widget === "w-delete";
}

function isMainOnlyWidget(widget: DashboardWidget): boolean {
    return widget.widget === "w-create" || widget.widget === "w-action" || widget.widget === "w-stat";
}

function widgetHasCollection(widget: DashboardWidget, collection: string): boolean {
    return "collection" in widget && widget.collection === collection;
}

function widgetTitle(widget: DashboardWidget): string {
    if ("label" in widget && widget.label) return widget.label;
    if ("collection" in widget) return sentenceCase(labelFromPath(widget.collection));
    if (widget.widget === "w-section") return widget.title ?? "Section";
    if (widget.widget === "w-stat") return widget.label ?? widget.endpoint;
    return widget.widget;
}

function labelFromPath(path: string): string {
    const leaf = path.split(".").filter(Boolean).at(-1) ?? path;
    return leaf.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function sentenceCase(value: string): string {
    return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, char => HTML_ESCAPE[char] ?? char);
}

function escapeAttr(value: string): string {
    return escapeHtml(value);
}

const HTML_ESCAPE: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};
