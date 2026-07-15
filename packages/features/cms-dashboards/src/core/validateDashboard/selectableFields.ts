import type { Source } from "@bernouy/cms-sources";
import type {
    DashboardDto,
    DashboardField,
    DashboardLookupCreate,
    DashboardLookupRef,
} from "../../interfaces/Dashboard";
import { validateDataRef, validateEndpointRef } from "./endpointRefs";
import {
    validateOptions,
    validatePath,
    validateResourceExpression,
    validateRequiredPath,
} from "./shared";

export type FieldValidator = (
    field: DashboardField,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    fieldIds: Set<string>,
    errors: string[],
    visibilityFieldIds?: ReadonlySet<string>,
) => void;

export function validateSelectableField(
    field: Extract<DashboardField, { type: "combobox" | "tokens" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
    validateNestedField: FieldValidator,
): void {
    const hasOptions = Array.isArray(field.options) && field.options.length > 0;
    const hasLookup = field.lookup !== undefined;
    if (!hasOptions && !hasLookup && field.allowCustom !== true) {
        errors.push(`${path} must declare options, lookup, or allowCustom`);
    }
    if (field.options !== undefined) validateOptions(field.options, `${path}.options`, errors);
    if (field.lookup) validateLookup(field.lookup, `${path}.lookup`, dashboard, source, errors, validateNestedField);
}

function validateLookup(
    lookup: DashboardLookupRef,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
    validateNestedField: FieldValidator,
): void {
    validateDataRef(dashboard, lookup, path, source, errors);
    validateRequiredPath("valuePath", lookup.valuePath, path, errors);
    validateRequiredPath("labelPath", lookup.labelPath, path, errors);
    validatePath("subtitlePath", lookup.subtitlePath, path, errors);
    validatePath("mediaPath", lookup.mediaPath, path, errors);
    lookup.descriptionPaths?.forEach((entry, index) => validatePath(`${index}`, entry, `${path}.descriptionPaths`, errors));
    if (lookup.selected !== undefined) validateResourceExpression(lookup.selected, `${path}.selected`, errors);
    if (lookup.create) validateLookupCreate(lookup.create, `${path}.create`, dashboard, source, errors, validateNestedField);
}

function validateLookupCreate(
    create: DashboardLookupCreate,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
    validateNestedField: FieldValidator,
): void {
    validateEndpointRef(dashboard, create, path, source, errors);
    validateRequiredPath("valuePath", create.valuePath, path, errors);
    validateRequiredPath("labelPath", create.labelPath, path, errors);
    if (create.mode === "inline") return;
    if (create.mode !== "modal") {
        errors.push(`${path}.mode is not supported`);
        return;
    }
    if (!Array.isArray(create.fields) || create.fields.length === 0) {
        errors.push(`${path}.fields must contain at least one field`);
        return;
    }
    const fieldIds = new Set<string>();
    const visibilityFieldIds = new Set(create.fields.map(field => field.id).filter(Boolean));
    create.fields.forEach((field, index) =>
        validateNestedField(field, `${path}.fields.${index}`, dashboard, source, fieldIds, errors, visibilityFieldIds));
}
