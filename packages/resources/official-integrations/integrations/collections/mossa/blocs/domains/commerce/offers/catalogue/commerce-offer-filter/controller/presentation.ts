import { filterControls, filterableFields, numericRange, schemaBrands } from "../schema/schema-helpers";

type Value = Record<string, unknown>;

export const presentationAttributes = [
    "advanced-label",
    "all-label",
    "boolean-false-label",
    "boolean-true-label",
    "brand-all-label",
    "brand-label",
    "empty-label",
    "error-label",
    "loading-label",
    "select-category-label",
];

export function filterPresentation(host: HTMLElement): Record<string, string> {
    return {
        advancedLabel: copy(host, "advanced-label", "Advanced filters"),
        allLabel: copy(host, "all-label", "All"),
        booleanFalseLabel: copy(host, "boolean-false-label", "No"),
        booleanTrueLabel: copy(host, "boolean-true-label", "Yes"),
        brandAllLabel: copy(host, "brand-all-label", "All brands"),
        brandLabel: copy(host, "brand-label", "Brand"),
        emptyLabel: copy(host, "empty-label", "No additional filters for this category."),
        errorLabel: copy(host, "error-label", "Filters for this category could not be loaded."),
        loadingLabel: copy(host, "loading-label", "Loading filters…"),
    };
}

export function projectSchema(value: unknown, host: HTMLElement): Record<string, unknown> {
    const result = record(value);
    const schema = record(result?.body) || result || {};
    return {
        brands: schemaBrands(schema),
        fields: filterableFields(schema).map((field: Value) => projectField(field, host)),
    };
}

function projectField(field: Value, host: HTMLElement): Record<string, unknown> {
    const controls = filterControls(field);
    const range = numericRange(field);
    const minimum = controls.find((control: Value) => control.operator === "gte")?.param || "";
    const maximum = controls.find((control: Value) => control.operator === "lte")?.param || "";
    const value = controls.find((control: Value) => control.operator === "eq")?.param || "";
    const label = String(field.label || "");
    return {
        label,
        maximum,
        minimum,
        options: Array.isArray(field.options) ? field.options.map(String) : [],
        range,
        rangeMode: minimum && maximum ? "range" : minimum ? "min" : "max",
        type: String(field.type || "string"),
        unit: typeof field.unit === "string" ? field.unit : "",
        value,
    };
}

function copy(host: HTMLElement, attribute: string, fallback: string): string {
    return host.getAttribute(attribute)?.trim() || fallback;
}

function record(value: unknown): Value | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Value) : null;
}
