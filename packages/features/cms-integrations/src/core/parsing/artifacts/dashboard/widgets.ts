import type { DashboardWidget } from "@bernouy/cms-dashboards";
import { IntegrationInputError } from "../../../errors";
import { isRecord, text } from "../../values";
import { requiredText } from "../common";
import { parseActions, parseSelection } from "./actions";
import { parseColumns, parseFilters } from "./columns";
import { parseDataRef } from "./refs";
import { parseSections } from "./fields";

export function parseWidget(value: unknown, name: string): DashboardWidget {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const widget = text(value.widget);
    if (widget === "w-section") {
        return {
            widget,
            id: requiredText(value.id, `${name}.id`),
            title: requiredText(value.title, `${name}.title`),
            ...(text(value.description) ? { description: text(value.description)! } : {}),
            children: parseWidgetArray(value.children, `${name}.children`),
        };
    }
    if (widget === "w-tabs") {
        if (!Array.isArray(value.tabs)) {
            throw new IntegrationInputError(`${name}.tabs`, "must be an array");
        }
        return {
            widget,
            id: requiredText(value.id, `${name}.id`),
            tabs: value.tabs.map((tab, index) => parseTab(tab, `${name}.tabs.${index}`)),
        };
    }
    if (widget === "w-table") {
        if (!isRecord(value.source)) {
            throw new IntegrationInputError(`${name}.source`, "must be an object");
        }
        return {
            widget,
            id: requiredText(value.id, `${name}.id`),
            ...(text(value.title) ? { title: text(value.title)! } : {}),
            source: parseDataRef(value.source, `${name}.source`),
            rowKey: requiredText(value.rowKey, `${name}.rowKey`),
            columns: parseColumns(value.columns, `${name}.columns`),
            ...(value.filters !== undefined ? { filters: parseFilters(value.filters, `${name}.filters`) } : {}),
            ...(typeof value.pageSize === "number" ? { pageSize: value.pageSize } : {}),
            ...(isRecord(value.selection) ? { selection: parseSelection(value.selection) } : {}),
            ...(value.actions !== undefined ? { actions: parseActions(value.actions, `${name}.actions`) } : {}),
        };
    }
    if (widget === "w-detail") {
        if (!isRecord(value.source)) {
            throw new IntegrationInputError(`${name}.source`, "must be an object");
        }
        return {
            widget,
            id: requiredText(value.id, `${name}.id`),
            source: parseDataRef(value.source, `${name}.source`),
            ...(isRecord(value.title) ? { title: parseBinding(value.title, `${name}.title`) } : {}),
            ...(isRecord(value.status) ? { status: parseBinding(value.status, `${name}.status`) } : {}),
            ...(value.actions !== undefined ? { actions: parseActions(value.actions, `${name}.actions`) } : {}),
            main: parseSections(value.main, `${name}.main`),
            ...(value.aside !== undefined ? { aside: parseSections(value.aside, `${name}.aside`) } : {}),
        };
    }
    if (widget === "w-navigation-list") {
        if (!isRecord(value.source)) {
            throw new IntegrationInputError(`${name}.source`, "must be an object");
        }
        if (!isRecord(value.item)) {
            throw new IntegrationInputError(`${name}.item`, "must be an object");
        }
        return {
            widget,
            id: requiredText(value.id, `${name}.id`),
            ...(text(value.title) ? { title: text(value.title)! } : {}),
            source: parseDataRef(value.source, `${name}.source`),
            rowKey: requiredText(value.rowKey, `${name}.rowKey`),
            item: parseNavigationItem(value.item, `${name}.item`),
            ...(isRecord(value.selection) ? { selection: parseSelection(value.selection) } : {}),
            ...(isRecord(value.reorderable)
                ? { reorderable: { action: requiredText(value.reorderable.action, `${name}.reorderable.action`) } }
                : {}),
            ...(value.actions !== undefined ? { actions: parseActions(value.actions, `${name}.actions`) } : {}),
        };
    }
    throw new IntegrationInputError(`${name}.widget`, "must be a supported dashboard widget");
}

function parseWidgetArray(value: unknown, name: string): DashboardWidget[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => parseWidget(entry, `${name}.${index}`));
}

function parseTab(value: unknown, name: string): { id: string; label: string; children: DashboardWidget[] } {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        children: parseWidgetArray(value.children, `${name}.children`),
    };
}

function parseBinding(value: Record<string, unknown>, name: string) {
    return {
        path: requiredText(value.path, `${name}.path`),
        ...(text(value.fallback) ? { fallback: text(value.fallback)! } : {}),
    };
}

function parseNavigationItem(value: Record<string, unknown>, name: string) {
    if (!isRecord(value.title)) {
        throw new IntegrationInputError(`${name}.title`, "must be an object");
    }
    return {
        title: parseBinding(value.title, `${name}.title`),
        ...(isRecord(value.subtitle) ? { subtitle: parseBinding(value.subtitle, `${name}.subtitle`) } : {}),
        ...(text(value.icon) ? { icon: text(value.icon)! } : {}),
        ...(isRecord(value.badge) ? { badge: parseBinding(value.badge, `${name}.badge`) } : {}),
    };
}
