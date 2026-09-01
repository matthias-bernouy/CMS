import type { DashboardAction, DashboardField, DashboardSection, DashboardWidget } from "@bernouy/cms-dashboards";

export type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;
export type MediaField = Extract<DashboardField, { type: "media" }>;
export type ReorderableMediaField = Extract<DashboardField, { type: "reorderable-list" }>["fields"][number] & {
    type: "media";
};
export type MediaFieldTarget = {
    field: MediaField | ReorderableMediaField;
    parent?: Extract<DashboardField, { type: "reorderable-list" }>;
};

export function findDetailWidget(widgets: DashboardWidget[], id: string): DetailWidget | null {
    for (const widget of widgets) {
        if (widget.widget === "w-detail" && widget.id === id) {
            return widget;
        }
        if (widget.widget === "w-section") {
            const found = findDetailWidget(widget.children, id);
            if (found) {
                return found;
            }
        }
        if (widget.widget === "w-tabs") {
            for (const tab of widget.tabs) {
                const found = findDetailWidget(tab.children, id);
                if (found) {
                    return found;
                }
            }
        }
    }
    return null;
}

export function findCollectionAction(
    widgets: DashboardWidget[],
    actionId: string,
    widgetId: string | undefined,
): DashboardAction | null {
    for (const widget of widgets) {
        if (
            (widget.widget === "w-table" || widget.widget === "w-navigation-list") &&
            (!widgetId || widget.id === widgetId)
        ) {
            const action = widget.actions?.find((item) => item.id === actionId);
            if (action) {
                return action;
            }
        }
        if (widget.widget === "w-section") {
            const found = findCollectionAction(widget.children, actionId, widgetId);
            if (found) {
                return found;
            }
        }
        if (widget.widget === "w-tabs") {
            for (const tab of widget.tabs) {
                const found = findCollectionAction(tab.children, actionId, widgetId);
                if (found) {
                    return found;
                }
            }
        }
        if (widget.widget === "w-detail") {
            const found = findCollectionAction(
                widget.main.filter(
                    (item): item is Extract<DashboardWidget, { widget: "w-navigation-list" }> => "widget" in item,
                ),
                actionId,
                widgetId,
            );
            if (found) {
                return found;
            }
        }
    }
    return null;
}

export function findMediaField(widget: DetailWidget, fieldId: string, itemFieldId?: string): MediaFieldTarget | null {
    const fields = [...widget.main.filter(isDetailSection), ...(widget.aside ?? [])].flatMap(
        (section) => section.fields,
    );
    const direct = fields.find((field): field is MediaField => field.id === fieldId && field.type === "media");
    if (direct) {
        return { field: direct };
    }
    const parent = fields.find(
        (field): field is Extract<DashboardField, { type: "reorderable-list" }> =>
            field.id === fieldId && field.type === "reorderable-list",
    );
    const nested = parent?.fields.find(
        (field): field is ReorderableMediaField => field.id === itemFieldId && field.type === "media",
    );
    return parent && nested ? { field: nested, parent } : null;
}

function isDetailSection(item: DetailWidget["main"][number]): item is DashboardSection {
    return !("widget" in item);
}
