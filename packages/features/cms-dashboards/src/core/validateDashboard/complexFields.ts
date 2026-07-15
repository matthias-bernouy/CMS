import type { Source } from "@bernouy/cms-sources";
import type { DashboardDto, DashboardEmbeddedLookupRef, DashboardField,
    DashboardOption } from "../../interfaces/Dashboard";
import { DASHBOARD_MAX_NESTED_FIELDS } from "../../interfaces/Dashboard";
import { validateEmbeddedLookupRef, validateEndpointRef } from "./endpointRefs";
import { isRecord, validateOptions, validatePath, validateRequiredId,
    validateRequiredPath } from "./shared";

export function validateTableField(
    field: Extract<DashboardField, { type: "table" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    if (!Array.isArray(field.columns) || field.columns.length === 0) {
        errors.push(`${path}.columns must be a non-empty array`);
        return;
    }
    if (field.columns.length > DASHBOARD_MAX_NESTED_FIELDS) {
        errors.push(`${path}.columns must contain at most ${DASHBOARD_MAX_NESTED_FIELDS} columns`);
    }
    if (field.addLabel !== undefined) {
        if (typeof field.addLabel !== "string" || !field.addLabel.trim()) {
            errors.push(`${path}.addLabel must be a non-empty string`);
        }
        if (field.editable !== true) errors.push(`${path}.addLabel requires an editable table`);
    }
    const columnIds = new Set<string>();
    field.columns.slice(0, DASHBOARD_MAX_NESTED_FIELDS).forEach((column, index) => {
        const columnPath = `${path}.columns.${index}`;
        validateRequiredId(`${columnPath}.id`, column.id, errors);
        if (column.id) {
            if (columnIds.has(column.id)) errors.push(`${columnPath}.id is duplicated`);
            columnIds.add(column.id);
        }
        if (!column.label) errors.push(`${columnPath}.label is required`);
        validateRequiredPath("path", column.path, columnPath, errors);
        if (Object.hasOwn(column, "value")) errors.push(`${columnPath}.value is not supported; use type`);
        validateTableColumnEditing(field, column, columnPath, dashboard, source, errors);
    });
    if (field.derive) {
        if (field.derive.type !== "cartesian") errors.push(`${path}.derive.type is not supported`);
        if (!field.derive.sourceField) errors.push(`${path}.derive.sourceField is required`);
        validateRequiredPath("derive.labelPath", field.derive.labelPath, path, errors);
        validateRequiredPath("derive.valuesPath", field.derive.valuesPath, path, errors);
    }
}

export function validateReorderableListField(
    field: Extract<DashboardField, { type: "reorderable-list" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    validateRequiredPath("itemKey", field.itemKey, path, errors);
    validatePath("positionPath", field.positionPath, path, errors);
    if (!Array.isArray(field.fields) || field.fields.length === 0) {
        errors.push(`${path}.fields must be a non-empty array`);
        return;
    }
    if (field.fields.length > DASHBOARD_MAX_NESTED_FIELDS) {
        errors.push(`${path}.fields must contain at most ${DASHBOARD_MAX_NESTED_FIELDS} fields`);
    }
    const itemFieldIds = new Set<string>();
    for (const [index, itemField] of field.fields.slice(0, DASHBOARD_MAX_NESTED_FIELDS).entries()) {
        const itemPath = `${path}.fields.${index}`;
        validateRequiredId(`${itemPath}.id`, itemField.id, errors);
        if (itemField.id) {
            if (itemFieldIds.has(itemField.id)) errors.push(`${itemPath}.id is duplicated`);
            itemFieldIds.add(itemField.id);
        }
        if (!itemField.label) errors.push(`${itemPath}.label is required`);
        validateRequiredPath("path", itemField.path, itemPath, errors);
        validateNestedEditor(itemField, itemPath, ["text", "checkbox", "select", "combobox"], dashboard, source, errors);
    }
    if (field.minItems !== undefined && (!Number.isInteger(field.minItems) || field.minItems < 0)) {
        errors.push(`${path}.minItems must be a non-negative integer`);
    }
    if (field.maxItems !== undefined && (!Number.isInteger(field.maxItems) || field.maxItems < 1)) {
        errors.push(`${path}.maxItems must be a positive integer`);
    }
    if (field.minItems !== undefined && field.maxItems !== undefined && field.minItems > field.maxItems) {
        errors.push(`${path}.minItems cannot exceed maxItems`);
    }
}

function validateTableColumnEditing(
    table: Extract<DashboardField, { type: "table" }>,
    column: Extract<DashboardField, { type: "table" }>["columns"][number],
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    const hasEditingConfig = column.editable === true || column.type !== undefined
        || column.options !== undefined
        || column.lookup !== undefined;
    if (hasEditingConfig && table.editable !== true) {
        errors.push(`${path} cannot configure editing unless the table is editable`);
        return;
    }
    if (column.editable !== true) {
        if (column.type !== undefined || column.options !== undefined || column.lookup !== undefined) {
            errors.push(`${path} cannot configure an editor unless the column is editable`);
        }
        return;
    }
    validateNestedEditor(column, path, ["text", "select", "combobox", "tokens"], dashboard, source, errors);
}

function validateNestedEditor(
    editor: {
        type?: string;
        options?: DashboardOption[];
        lookup?: DashboardEmbeddedLookupRef;
    },
    path: string,
    allowedTypes: readonly string[],
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    const type = editor.type ?? "text";
    if (isRecord(editor) && Object.hasOwn(editor, "allowCustom")) {
        errors.push(`${path}.allowCustom is not supported for nested editors`);
    }
    if (!allowedTypes.includes(type)) {
        errors.push(`${path}.type is not supported`);
        return;
    }
    if (type === "select" && editor.options === undefined) errors.push(`${path}.options is required`);
    if (type === "combobox" && !editor.options?.length && !editor.lookup) {
        errors.push(`${path} must declare options or lookup`);
    }
    if (editor.options !== undefined) {
        if (type !== "select" && type !== "combobox") {
            errors.push(`${path}.options is not supported for ${type} editors`);
        } else validateOptions(editor.options, `${path}.options`, errors);
    }
    if (editor.lookup !== undefined) {
        if (type !== "combobox") {
            errors.push(`${path}.lookup is only supported for combobox editors`);
            return;
        }
        validateEmbeddedLookupRef(dashboard, editor.lookup, `${path}.lookup`, source, errors);
        if (isRecord(editor.lookup) && Object.hasOwn(editor.lookup, "create")) {
            errors.push(`${path}.lookup.create is not supported`);
        }
        if (isRecord(editor.lookup) && Object.hasOwn(editor.lookup, "descriptionPaths")) {
            errors.push(`${path}.lookup.descriptionPaths is not supported`);
        }
    }
}

export function validateMediaField(
    field: Extract<DashboardField, { type: "media" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    validatePath("item.idPath", field.item.idPath, path, errors);
    validateRequiredPath("item.urlPath", field.item.urlPath, path, errors);
    validatePath("item.altPath", field.item.altPath, path, errors);
    if (!field.actions) return;
    for (const [action, ref] of Object.entries(field.actions)) {
        if (ref) validateEndpointRef(dashboard, ref, `${path}.actions.${action}`, source, errors);
    }
}
