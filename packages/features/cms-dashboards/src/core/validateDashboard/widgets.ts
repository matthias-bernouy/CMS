import type { Source } from "@bernouy/cms-sources";
import type {
    DashboardDto,
    DashboardWidget,
} from "../../interfaces/Dashboard";
import { validateDetailWidget, validateTableWidget } from "./tableDetailWidgets";
import { validateRequiredId } from "./shared";

export function collectWidgetIds(
    widgets: DashboardWidget[],
    path: string,
    widgetIds: Set<string>,
    errors: string[],
): void {
    widgets.forEach((widget, index) => {
        const widgetPath = `${path}.${index}`;
        validateRequiredId(`${widgetPath}.id`, widget.id, errors);
        if (widget.id) {
            if (widgetIds.has(widget.id)) errors.push(`duplicate widget id "${widget.id}"`);
            widgetIds.add(widget.id);
        }
        if (widget.widget === "w-section") {
            collectWidgetIds(widget.children, `${widgetPath}.children`, widgetIds, errors);
        } else if (widget.widget === "w-tabs") {
            widget.tabs.forEach((tab, tabIndex) =>
                collectWidgetIds(tab.children, `${widgetPath}.tabs.${tabIndex}.children`, widgetIds, errors));
        }
    });
}

export function validateWidget(
    widget: DashboardWidget,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    widgetIds: Set<string>,
    errors: string[],
): void {
    switch ((widget as { widget?: string }).widget) {
        case "w-table":
            validateTableWidget(widget as Extract<DashboardWidget, { widget: "w-table" }>, path, dashboard, source, widgetIds, errors);
            break;
        case "w-detail":
            validateDetailWidget(widget as Extract<DashboardWidget, { widget: "w-detail" }>, path, dashboard, source, errors);
            break;
        case "w-section":
            validateSectionWidget(widget as Extract<DashboardWidget, { widget: "w-section" }>, path, dashboard, source, widgetIds, errors);
            break;
        case "w-tabs":
            validateTabsWidget(widget as Extract<DashboardWidget, { widget: "w-tabs" }>, path, dashboard, source, widgetIds, errors);
            break;
        default:
            errors.push(`${path}.widget is not supported`);
    }
}

function validateSectionWidget(
    widget: Extract<DashboardWidget, { widget: "w-section" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    widgetIds: Set<string>,
    errors: string[],
): void {
    if (!widget.title) errors.push(`${path}.title is required`);
    if (!Array.isArray(widget.children) || widget.children.length === 0) {
        errors.push(`${path}.children must contain at least one widget`);
        return;
    }
    widget.children.forEach((child, index) => validateWidget(child, `${path}.children.${index}`, dashboard, source, widgetIds, errors));
}

function validateTabsWidget(
    widget: Extract<DashboardWidget, { widget: "w-tabs" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    widgetIds: Set<string>,
    errors: string[],
): void {
    if (!Array.isArray(widget.tabs) || widget.tabs.length === 0) {
        errors.push(`${path}.tabs must contain at least one tab`);
        return;
    }
    const tabIds = new Set<string>();
    widget.tabs.forEach((tab, index) => {
        validateRequiredId(`${path}.tabs.${index}.id`, tab.id, errors);
        if (tab.id) {
            if (tabIds.has(tab.id)) errors.push(`duplicate tab id "${tab.id}" in ${path}`);
            tabIds.add(tab.id);
        }
        if (!tab.label) errors.push(`${path}.tabs.${index}.label is required`);
        if (!Array.isArray(tab.children) || tab.children.length === 0) errors.push(`${path}.tabs.${index}.children must contain at least one widget`);
        tab.children?.forEach((child, childIndex) =>
            validateWidget(child, `${path}.tabs.${index}.children.${childIndex}`, dashboard, source, widgetIds, errors));
    });
}
