import type { Source } from "@bernouy/cms-sources";
import type {
    DashboardDto,
    DashboardField,
    DashboardSection,
} from "../../interfaces/Dashboard";
import { validateMediaField, validateReorderableListField, validateTableField } from "./complexFields";
import { validateSelectableField } from "./selectableFields";
import {
    validateOptions,
    validateRequiredId,
    validateRequiredPath,
    validateVisibility,
} from "./shared";

export function validateSection(
    section: DashboardSection,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    fieldIds: Set<string>,
    errors: string[],
    visibilityFieldIds: ReadonlySet<string> = fieldIds,
): void {
    validateRequiredId(`${path}.id`, section.id, errors);
    if (!section.title) errors.push(`${path}.title is required`);
    if (!Array.isArray(section.fields)) {
        errors.push(`${path}.fields must be an array`);
        return;
    }
    section.fields.forEach((field, index) => validateField(
        field,
        `${path}.fields.${index}`,
        dashboard,
        source,
        fieldIds,
        errors,
        visibilityFieldIds,
    ));
}

export function validateField(
    field: DashboardField,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    fieldIds: Set<string>,
    errors: string[],
    visibilityFieldIds: ReadonlySet<string> = fieldIds,
): void {
    validateRequiredId(`${path}.id`, field.id, errors);
    if (field.id) {
        if (fieldIds.has(field.id)) errors.push(`duplicate field id "${field.id}"`);
        fieldIds.add(field.id);
    }
    if (!field.label) errors.push(`${path}.label is required`);
    validateRequiredPath("path", field.path, path, errors);
    validateVisibility(field.visibleWhen, `${path}.visibleWhen`, errors, visibilityFieldIds);

    switch (field.type) {
        case "text":
        case "readonly":
            break;
        case "textarea":
            if (field.rows !== undefined && (!Number.isInteger(field.rows) || field.rows < 1)) errors.push(`${path}.rows must be a positive integer`);
            break;
        case "select":
            validateOptions(field.options, `${path}.options`, errors);
            break;
        case "combobox":
        case "tokens":
            validateSelectableField(field, path, dashboard, source, errors, validateField);
            break;
        case "table":
            validateTableField(field, path, errors);
            break;
        case "reorderable-list":
            validateReorderableListField(field, path, errors);
            break;
        case "media":
            validateMediaField(field, path, dashboard, source, errors);
            break;
        default:
            errors.push(`${path}.type is not supported`);
    }
}
