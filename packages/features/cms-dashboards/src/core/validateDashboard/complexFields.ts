import type { Source } from "@bernouy/cms-sources";
import type {
    DashboardDto,
    DashboardField,
} from "../../interfaces/Dashboard";
import { validateEndpointRef } from "./endpointRefs";
import {
    validatePath,
    validateRequiredId,
    validateRequiredPath,
} from "./shared";

export function validateTableField(
    field: Extract<DashboardField, { type: "table" }>,
    path: string,
    errors: string[],
): void {
    if (!Array.isArray(field.columns) || field.columns.length === 0) {
        errors.push(`${path}.columns must be a non-empty array`);
        return;
    }
    field.columns.forEach((column, index) => {
        const columnPath = `${path}.columns.${index}`;
        validateRequiredId(`${columnPath}.id`, column.id, errors);
        if (!column.label) errors.push(`${columnPath}.label is required`);
        validateRequiredPath("path", column.path, columnPath, errors);
        if (column.value !== undefined && !["text", "list"].includes(column.value)) {
            errors.push(`${columnPath}.value is not supported`);
        }
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
    errors: string[],
): void {
    validateRequiredPath("itemKey", field.itemKey, path, errors);
    validatePath("positionPath", field.positionPath, path, errors);
    if (!Array.isArray(field.fields) || field.fields.length === 0) {
        errors.push(`${path}.fields must be a non-empty array`);
        return;
    }
    const itemFieldIds = new Set<string>();
    for (const [index, itemField] of field.fields.entries()) {
        const itemPath = `${path}.fields.${index}`;
        validateRequiredId(`${itemPath}.id`, itemField.id, errors);
        if (itemField.id) {
            if (itemFieldIds.has(itemField.id)) errors.push(`${itemPath}.id is duplicated`);
            itemFieldIds.add(itemField.id);
        }
        if (!itemField.label) errors.push(`${itemPath}.label is required`);
        validateRequiredPath("path", itemField.path, itemPath, errors);
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
