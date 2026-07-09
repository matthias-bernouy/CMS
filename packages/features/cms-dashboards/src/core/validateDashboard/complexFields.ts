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
