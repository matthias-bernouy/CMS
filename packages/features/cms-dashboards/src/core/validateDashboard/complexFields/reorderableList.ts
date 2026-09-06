import type { Source } from "@bernouy/cms-sources";
import type { DashboardDto, DashboardField } from "cms-dashboards/interfaces/Dashboard";
import { DASHBOARD_MAX_NESTED_FIELDS } from "cms-dashboards/interfaces/Dashboard";
import { validatePath, validateRequiredId, validateRequiredPath } from "../shared";
import { validateMediaDefinition } from "./media";
import { validateNestedEditor } from "./nestedEditor";

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
            if (itemFieldIds.has(itemField.id)) {
                errors.push(`${itemPath}.id is duplicated`);
            }
            itemFieldIds.add(itemField.id);
        }
        if (!itemField.label) {
            errors.push(`${itemPath}.label is required`);
        }
        validateRequiredPath("path", itemField.path, itemPath, errors);
        if (itemField.type === "page-link") {
            for (const key of ["publishedOnly", "allowExternal", "allowMedia"] as const) {
                if (itemField[key] !== undefined && typeof itemField[key] !== "boolean") {
                    errors.push(`${itemPath}.${key} must be a boolean`);
                }
            }
        }
        if (itemField.type === "media") {
            validateMediaDefinition(itemField, itemPath, dashboard, source, errors);
        } else {
            validateNestedEditor(
                itemField,
                itemPath,
                ["text", "checkbox", "select", "combobox", "secret-ref", "page-link"],
                dashboard,
                source,
                errors,
            );
        }
    }
    if (field.layout !== undefined && field.layout !== "rows" && field.layout !== "cards") {
        errors.push(`${path}.layout must be rows or cards`);
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
