import type { Source } from "@bernouy/cms-sources";
import type {
    DashboardColumn,
    DashboardDetailMainItem,
    DashboardDto,
    DashboardFilter,
    DashboardSection,
    DashboardWidget,
} from "../../interfaces/Dashboard";
import { validateAction } from "./actions";
import { validateDataRef } from "./endpointRefs";
import { validateSection } from "./fields";
import {
    validateBinding,
    validateId,
    validateOptions,
    validatePath,
    validateRequiredId,
    validateRequiredPath,
} from "./shared";

export function validateTableWidget(
    widget: Extract<DashboardWidget, { widget: "w-table" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    widgetIds: Set<string>,
    errors: string[],
): void {
    validateDataRef(dashboard, widget.source, `${path}.source`, source, errors);
    validateRequiredPath("rowKey", widget.rowKey, path, errors);
    if (!Array.isArray(widget.columns) || widget.columns.length === 0) {
        errors.push(`${path}.columns must contain at least one column`);
    } else {
        widget.columns.forEach((column, index) => validateColumn(column, `${path}.columns.${index}`, errors));
    }
    widget.filters?.forEach((filter, index) => validateFilter(filter, `${path}.filters.${index}`, errors));
    if (widget.pageSize !== undefined && (!Number.isInteger(widget.pageSize) || widget.pageSize < 1)) {
        errors.push(`${path}.pageSize must be a positive integer`);
    }
    if (widget.selection?.opens && !widgetIds.has(widget.selection.opens)) {
        errors.push(`${path}.selection.opens references unknown widget "${widget.selection.opens}"`);
    }
    widget.actions?.forEach((action, index) =>
        validateAction(action, `${path}.actions.${index}`, dashboard, source, errors),
    );
}

export function validateDetailWidget(
    widget: Extract<DashboardWidget, { widget: "w-detail" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    widgetIds: Set<string>,
    errors: string[],
): void {
    validateDataRef(dashboard, widget.source, `${path}.source`, source, errors);
    validateBinding(widget.title, `${path}.title`, errors);
    validateBinding(widget.status, `${path}.status`, errors);
    const visibilityFieldIds = detailFieldIds(widget);
    widget.actions?.forEach((action, index) =>
        validateAction(action, `${path}.actions.${index}`, dashboard, source, errors, visibilityFieldIds),
    );
    if (!Array.isArray(widget.main) || widget.main.length === 0) {
        errors.push(`${path}.main must contain at least one item`);
    }
    const fieldIds = new Set<string>();
    if (Array.isArray(widget.main)) {
        widget.main.forEach((item, index) => {
            const itemPath = `${path}.main.${index}`;
            const discriminator = (item as { widget?: unknown })?.widget;
            if (discriminator !== undefined) {
                if (discriminator !== "w-navigation-list") {
                    errors.push(`${itemPath}.widget must be w-navigation-list`);
                    return;
                }
                validateNavigationListWidget(
                    item as Extract<DashboardWidget, { widget: "w-navigation-list" }>,
                    itemPath,
                    dashboard,
                    source,
                    widgetIds,
                    errors,
                );
                return;
            }
            validateSection(
                item as DashboardSection,
                itemPath,
                dashboard,
                source,
                fieldIds,
                errors,
                visibilityFieldIds,
            );
        });
    }
    if (Array.isArray(widget.aside)) {
        widget.aside.forEach((section, index) =>
            validateSection(section, `${path}.aside.${index}`, dashboard, source, fieldIds, errors, visibilityFieldIds),
        );
    }
}

function detailFieldIds(widget: Extract<DashboardWidget, { widget: "w-detail" }>): Set<string> {
    const sections = [
        ...(Array.isArray(widget.main) ? widget.main : []),
        ...(Array.isArray(widget.aside) ? widget.aside : []),
    ];
    return new Set(
        sections
            .filter(isDetailSection)
            .flatMap((section) => (Array.isArray(section?.fields) ? section.fields : []))
            .map((field) => field?.id)
            .filter(Boolean),
    );
}

function isDetailSection(item: DashboardDetailMainItem | DashboardSection): item is DashboardSection {
    return (item as { widget?: unknown })?.widget === undefined;
}

export function validateNavigationListWidget(
    widget: Extract<DashboardWidget, { widget: "w-navigation-list" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    widgetIds: Set<string>,
    errors: string[],
): void {
    validateDataRef(dashboard, widget.source, `${path}.source`, source, errors);
    validateRequiredPath("rowKey", widget.rowKey, path, errors);
    validateBinding(widget.item.title, `${path}.item.title`, errors);
    validateBinding(widget.item.subtitle, `${path}.item.subtitle`, errors);
    validateBinding(widget.item.badge, `${path}.item.badge`, errors);
    if (widget.selection?.opens && !widgetIds.has(widget.selection.opens)) {
        errors.push(`${path}.selection.opens references unknown widget "${widget.selection.opens}"`);
    }
    widget.actions?.forEach((action, index) =>
        validateAction(action, `${path}.actions.${index}`, dashboard, source, errors),
    );
    if (widget.reorderable) {
        const action = widget.actions?.find((item) => item.id === widget.reorderable!.action);
        if (!action) {
            errors.push(`${path}.reorderable.action references unknown action "${widget.reorderable.action}"`);
        } else if (!action.endpoint) {
            errors.push(`${path}.reorderable.action must declare an endpoint`);
        }
    }
}

function validateColumn(column: DashboardColumn, path: string, errors: string[]): void {
    validateRequiredId(`${path}.id`, column.id, errors);
    if (!column.label) {
        errors.push(`${path}.label is required`);
    }
    validateRequiredPath("path", column.path, path, errors);
    if (column.format !== undefined && !["text", "badge", "date", "money"].includes(column.format)) {
        errors.push(`${path}.format is not supported`);
    }
}

function validateFilter(filter: DashboardFilter, path: string, errors: string[]): void {
    validateRequiredId(`${path}.id`, filter.id, errors);
    if (!filter.label) {
        errors.push(`${path}.label is required`);
    }
    validatePath("path", filter.path, path, errors);
    validateId(`${path}.param`, filter.param, errors);
    if (!filter.path && !filter.param) {
        errors.push(`${path} must declare path or param`);
    }
    if (filter.type !== undefined && filter.type !== "text" && filter.type !== "select") {
        errors.push(`${path}.type is not supported`);
    }
    if (filter.type === "select") {
        validateOptions(filter.options, `${path}.options`, errors);
    }
}
