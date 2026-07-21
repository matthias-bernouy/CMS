import type { Source } from "@bernouy/cms-sources";
import type { DashboardDto, DashboardField, DashboardSection } from "../../interfaces/Dashboard";
import { isSafeDashboardExpression } from "../dashboardPaths";
import { validateMediaField, validateReorderableListField, validateTableField } from "./complexFields";
import { validateDataRef } from "./endpointRefs";
import { validateSelectableField } from "./selectableFields";
import { isRecord, validateOptions, validateRequiredId, validateRequiredPath, validateVisibility } from "./shared";

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
    if (!section.title) {
        errors.push(`${path}.title is required`);
    }
    if (!Array.isArray(section.fields)) {
        errors.push(`${path}.fields must be an array`);
        return;
    }
    section.fields.forEach((field, index) =>
        validateField(field, `${path}.fields.${index}`, dashboard, source, fieldIds, errors, visibilityFieldIds),
    );
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
        if (fieldIds.has(field.id)) {
            errors.push(`duplicate field id "${field.id}"`);
        }
        fieldIds.add(field.id);
    }
    if (!field.label) {
        errors.push(`${path}.label is required`);
    }
    validateRequiredPath("path", field.path, path, errors);
    validateVisibility(field.visibleWhen, `${path}.visibleWhen`, errors, visibilityFieldIds);

    switch (field.type) {
        case "text":
        case "checkbox":
        case "readonly":
            break;
        case "number":
            validateNumberField(field, path, errors);
            break;
        case "textarea":
            if (field.rows !== undefined && (!Number.isInteger(field.rows) || field.rows < 1)) {
                errors.push(`${path}.rows must be a positive integer`);
            }
            break;
        case "select":
            validateOptions(field.options, `${path}.options`, errors);
            break;
        case "combobox":
        case "tokens":
            validateSelectableField(field, path, dashboard, source, errors, validateField);
            break;
        case "table":
            validateTableField(field, path, dashboard, source, errors);
            break;
        case "reorderable-list":
            validateReorderableListField(field, path, dashboard, source, errors);
            break;
        case "schema":
            validateSchemaField(field, path, dashboard, source, visibilityFieldIds, errors);
            break;
        case "media":
            validateMediaField(field, path, dashboard, source, errors);
            break;
        default:
            errors.push(`${path}.type is not supported`);
    }
}

function validateNumberField(field: Extract<DashboardField, { type: "number" }>, path: string, errors: string[]): void {
    for (const key of ["min", "max", "step"] as const) {
        const value = field[key];
        if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
            errors.push(`${path}.${key} must be a finite number`);
        }
    }
    if (typeof field.step === "number" && Number.isFinite(field.step) && field.step <= 0) {
        errors.push(`${path}.step must be greater than zero`);
    }
    if (
        typeof field.min === "number" &&
        Number.isFinite(field.min) &&
        typeof field.max === "number" &&
        Number.isFinite(field.max) &&
        field.max < field.min
    ) {
        errors.push(`${path}.max must be greater than or equal to min`);
    }
}

function validateSchemaField(
    field: Extract<DashboardField, { type: "schema" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    fieldIds: ReadonlySet<string>,
    errors: string[],
): void {
    const raw = field as unknown as Record<string, unknown>;
    for (const legacyKey of ["reloadOn", "excludeKeysFrom"]) {
        if (Object.hasOwn(raw, legacyKey)) {
            errors.push(`${path}.${legacyKey} is not supported`);
        }
    }
    validateDataRef(dashboard, field.schema, `${path}.schema`, source, errors);
    if (field.exclude === undefined) {
        return;
    }
    if (!isRecord(field.exclude)) {
        errors.push(`${path}.exclude must be an object`);
        return;
    }
    if (Object.keys(field.exclude).some((key) => key !== "from" && key !== "valuePath")) {
        errors.push(`${path}.exclude contains unsupported properties`);
    }
    const from = Object.hasOwn(field.exclude, "from") ? field.exclude.from : undefined;
    if (typeof from !== "string" || !isSafeDashboardExpression(from, ["field"], true)) {
        errors.push(`${path}.exclude.from must be a $field expression with a safe dotted data path`);
    } else {
        const fieldId = from.slice("$field.".length).split(".")[0]!;
        if (!fieldIds.has(fieldId)) {
            errors.push(`${path}.exclude.from references unknown field "${fieldId}"`);
        }
    }
    validateRequiredPath(
        "valuePath",
        Object.hasOwn(field.exclude, "valuePath") && typeof field.exclude.valuePath === "string"
            ? field.exclude.valuePath
            : undefined,
        `${path}.exclude`,
        errors,
    );
}
