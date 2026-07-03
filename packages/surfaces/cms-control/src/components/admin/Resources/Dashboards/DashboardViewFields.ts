import type { DashboardField, DashboardWidget } from "@bernouy/cms-dashboards";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DetailSelection } from "./domain";

type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;

export function fieldChangeNeedsRender(dashboard: DashboardDto | null | undefined, detail: DetailSelection | null, fieldId: string): boolean {
    if (!dashboard || !detail) return false;
    const widget = findDetailWidget(dashboard.views, detail.collection);
    if (!widget) return false;
    return detailFields(widget).some(field => dependsOnField(field, fieldId));
}

function findDetailWidget(widgets: DashboardWidget[], id: string): DetailWidget | null {
    for (const widget of widgets) {
        if (widget.widget === "w-detail" && widget.id === id) return widget;
        if (widget.widget === "w-section") {
            const found = findDetailWidget(widget.children, id);
            if (found) return found;
        }
        if (widget.widget === "w-tabs") {
            for (const tab of widget.tabs) {
                const found = findDetailWidget(tab.children, id);
                if (found) return found;
            }
        }
    }
    return null;
}

function detailFields(widget: DetailWidget): DashboardField[] {
    return [...widget.main, ...(widget.aside ?? [])].flatMap(section => section.fields);
}

function dependsOnField(field: DashboardField, fieldId: string): boolean {
    if (field.visibleWhen?.field === fieldId) return true;
    if ((field.type !== "combobox" && field.type !== "tokens") || !field.lookup) return false;
    return Object.values(field.lookup.params ?? {}).some(expression => expressionUsesField(expression, fieldId));
}

function expressionUsesField(expression: string, fieldId: string): boolean {
    return expression === `$field.${fieldId}` || expression.startsWith(`$field.${fieldId}.`);
}
