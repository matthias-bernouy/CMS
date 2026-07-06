import type { DashboardAction, DashboardField, DashboardOption, DashboardWidget } from "@bernouy/cms-dashboards";
import type { WDetailData, WDetailField, WDetailSection } from "../widgets/w-detail/types";
import type { WTableCell, WTableData, WTableRow } from "../widgets/w-table/types";
import { pathLabel, textAt, valueAt } from "./expressions";
import { mediaValue } from "./media";

type TableWidget = Extract<DashboardWidget, { widget: "w-table" }>;
type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;
export type DetailOptions = Record<string, DashboardOption[]>;

export function tableData(widget: TableWidget, items: unknown[]): WTableData {
    return {
        title: widget.title ?? pathLabel(widget.source.endpoint),
        actions: (widget.actions ?? []).map(action => ({
            label: action.label,
            action: action.id,
            ...(action.selection?.opens ? { target: action.selection.opens } : {}),
            tone: action.tone,
        })),
        columns: widget.columns.map(column => ({
            key: column.id,
            label: column.label,
            ...(column.width ? { width: column.width } : {}),
            ...(column.primary ? { primary: true } : {}),
        })),
        rows: items.map(item => tableRow(widget, item)),
    };
}

export function detailData(widget: DetailWidget, resource: unknown, rowKey: string, draft: Record<string, unknown> = {}, options: DetailOptions = {}, sourceId = ""): WDetailData {
    const fields = { ...fieldValues(widget, resource), ...draft };
    return {
        rowKey,
        eyebrow: widget.id,
        title: textAt({ ...record(resource), ...fields }, widget.title?.path, widget.title?.fallback ?? widget.id),
        status: widget.status ? textAt({ ...record(resource), ...fields }, widget.status.path, widget.status.fallback) : undefined,
        actions: (widget.actions ?? []).map(actionData),
        main: sections(widget.main, resource, fields, options, sourceId),
        aside: sections(widget.aside ?? [], resource, fields, options, sourceId),
    };
}

function tableRow(widget: TableWidget, item: unknown): WTableRow {
    const id = textAt(item, widget.rowKey);
    return {
        id,
        collection: widget.selection?.opens ?? widget.id,
        cells: Object.fromEntries(widget.columns.map(column => [column.id, tableCell(item, column)])),
    };
}

function tableCell(item: unknown, column: TableWidget["columns"][number]): WTableCell {
    const value = textAt(item, column.path);
    if (column.format === "badge") return { title: value, tone: "badge" };
    if (column.primary) return { title: value, meta: textAt(item, "id") };
    return value;
}

function sections(sections: DetailWidget["main"], resource: unknown, fields: Record<string, unknown>, options: DetailOptions, sourceId: string): WDetailSection[] {
    return sections.map(section => ({
        title: section.title,
        ...(section.description ? { description: section.description } : {}),
        fields: section.fields
            .filter(field => isVisible(field, fields))
            .map(field => detailField(field, { ...record(resource), ...fields }, options[field.id] ?? [], sourceId)),
    }));
}

function detailField(field: DashboardField, resource: unknown, dynamicOptions: DashboardOption[], sourceId: string): WDetailField {
    const value = valueAt(resource, field.path);
    const base = { id: field.id, label: field.label };
    if (field.type === "textarea") return { ...base, input: "textarea", value: textValue(value) };
    if (field.type === "select") return { ...base, input: "select", value: textValue(value), options: field.options.map(optionData) };
    if (field.type === "combobox") return { ...base, input: "combobox", value: textValue(value), options: optionList(field.options, dynamicOptions), creatable: isCreatable(field) };
    if (field.type === "tokens") return { ...base, input: "tokens", value: tokenValue(value), options: optionList(field.options, dynamicOptions), creatable: isCreatable(field) };
    if (field.type === "table") return {
        ...base,
        input: "table",
        value: tableValue(value),
        columns: field.columns.map(column => ({
            key: column.id,
            label: column.label,
            path: column.path,
            ...(column.width ? { width: column.width } : {}),
            ...(column.editable === true ? { editable: true } : {}),
            ...(column.value ? { value: column.value } : {}),
        })),
        ...(field.derive ? { derive: field.derive } : {}),
        ...(field.editable === true ? { editable: true } : {}),
    };
    if (field.type === "media") return { ...base, input: "media-list", value: mediaValue(value, field, sourceId), accept: "image/*" };
    if (field.type === "readonly") return { ...base, input: field.format === "badge" ? "badge" : "readonly", value: readonlyValue(value) };
    return { ...base, input: "text", value: textValue(value) };
}

export function fieldValues(widget: DetailWidget, resource: unknown): Record<string, unknown> {
    const all = [...widget.main, ...(widget.aside ?? [])].flatMap(section => section.fields);
    return Object.fromEntries(all.map(field => [field.id, valueAt(resource, field.path)]));
}

function isVisible(field: DashboardField, fields: Record<string, unknown>): boolean {
    if (!field.visibleWhen) return true;
    const value = fields[field.visibleWhen.field];
    if ("equals" in field.visibleWhen) return value === field.visibleWhen.equals;
    if ("notEquals" in field.visibleWhen) return value !== field.visibleWhen.notEquals;
    return true;
}

function actionData(action: DashboardAction): WDetailData["actions"][number] {
    return {
        label: action.label,
        action: action.id,
        tone: action.tone,
        placement: action.placement,
        section: action.section,
        icon: isActionIcon(action.icon) ? action.icon : undefined,
    };
}

function optionData(option: DashboardOption): { label: string; value: string } {
    return { label: option.label, value: option.value };
}

function optionList(staticOptions: DashboardOption[] | undefined, dynamicOptions: DashboardOption[]): Array<{ label: string; value: string }> {
    const seen = new Set<string>();
    return [...(staticOptions ?? []), ...dynamicOptions]
        .filter(option => {
            if (seen.has(option.value)) return false;
            seen.add(option.value);
            return true;
        })
        .map(optionData);
}

function textValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
}

function readonlyValue(value: unknown): string | string[] {
    if (!Array.isArray(value)) return textValue(value);
    return value
        .map(item => item === null || item === undefined ? "" : String(item).trim())
        .filter(Boolean);
}

function tokenValue(value: unknown): string[] {
    return Array.isArray(value) ? value.map(textValue).filter(Boolean) : textValue(value).split(",").map(item => item.trim()).filter(Boolean);
}

function tableValue(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
        ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
        : [];
}

function isActionIcon(value: string | undefined): value is "archive" | "download" | "link" | "trash" {
    return value === "archive" || value === "download" || value === "link" || value === "trash";
}

function isCreatable(field: Extract<DashboardField, { type: "combobox" | "tokens" }>): boolean {
    return Boolean(field.allowCustom || field.lookup?.create?.mode === "inline");
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
