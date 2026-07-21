import type { Source } from "@bernouy/cms-sources";
import type {
    DashboardDto,
    DashboardField,
    DashboardLookupCreate,
    DashboardLookupRef,
} from "../../interfaces/Dashboard";
import { DASHBOARD_MAX_NESTED_FIELDS as MAX_NESTED_FIELDS } from "../../interfaces/Dashboard";
import { validateEmbeddedLookupRef, validateEndpointRef } from "./endpointRefs";
import { validateOptions, validatePath, validateRequiredPath } from "./shared";

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
    if (field.options !== undefined) {
        validateOptions(field.options, `${path}.options`, errors);
    }
    if (field.lookup) {
        validateLookup(field.lookup, `${path}.lookup`, dashboard, source, errors, validateNestedField);
    }
}

function validateLookup(
    lookup: DashboardLookupRef,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
    validateNestedField: FieldValidator,
): void {
    validateEmbeddedLookupRef(dashboard, lookup, path, source, errors);
    lookup.descriptionPaths?.forEach((entry, index) =>
        validatePath(`${index}`, entry, `${path}.descriptionPaths`, errors),
    );
    if (lookup.create) {
        validateLookupCreate(lookup.create, `${path}.create`, dashboard, source, errors, validateNestedField);
    }
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
    if (create.mode === "inline") {
        return;
    }
    if (create.mode !== "modal") {
        errors.push(`${path}.mode is not supported`);
        return;
    }
    if (!Array.isArray(create.fields) || create.fields.length === 0) {
        errors.push(`${path}.fields must contain at least one field`);
        return;
    }
    if (create.fields.length > MAX_NESTED_FIELDS) {
        errors.push(`${path}.fields must contain at most ${MAX_NESTED_FIELDS} fields`);
    }
    const fieldIds = new Set<string>();
    const visibilityFieldIds = new Set(create.fields.map((field) => field.id).filter(Boolean));
    create.fields
        .slice(0, MAX_NESTED_FIELDS)
        .forEach((field, index) =>
            validateNestedField(
                field,
                `${path}.fields.${index}`,
                dashboard,
                source,
                fieldIds,
                errors,
                visibilityFieldIds,
            ),
        );
}
